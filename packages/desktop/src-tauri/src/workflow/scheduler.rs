use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::AppHandle;
use tokio::sync::broadcast;

use super::db::WorkflowDb;
use super::engine::{execute_workflow, WorkflowEngine};
use super::types::WorkflowDef;

/// Start the workflow scheduler loop
pub fn start_workflow_scheduler(
    engine: Arc<Mutex<WorkflowEngine>>,
    db: Arc<WorkflowDb>,
    app: AppHandle,
    project_path: String,
) {
    let (cancel_tx, mut cancel_rx) = broadcast::channel::<()>(1);

    // Store cancel handle (stop existing scheduler for this project first)
    {
        if let Ok(mut eng) = engine.lock() {
            eng.stop_scheduler(&project_path);
            eng.set_scheduler_cancel(project_path.clone(), cancel_tx);
        }
    }

    tauri::async_runtime::spawn(async move {
        eprintln!(
            "[workflow] scheduler started for project: {}",
            project_path
        );

        // Track last fired time per workflow to prevent duplicate firing
        let mut last_fired: HashMap<String, chrono::DateTime<chrono::Utc>> = HashMap::new();

        loop {
            // Scan workflows
            let workflows = match super::parser::scan_workflows(&project_path) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("[workflow] scheduler scan error: {}", e);
                    Vec::new()
                }
            };

            // Find next fire time among all enabled + scheduled workflows
            let now = chrono::Utc::now();
            let mut next_fire: Option<chrono::DateTime<chrono::Utc>> = None;
            let mut due: Vec<(String, WorkflowDef, chrono::DateTime<chrono::Utc>)> = Vec::new();

            for (id, def, _) in &workflows {
                if !def.enabled {
                    continue;
                }
                if let Some(ref schedule) = def.trigger.schedule {
                    if let Ok(cron_expr) = schedule.to_cron() {
                        if let Ok(parsed) = cron_expr.parse::<cron::Schedule>() {
                            if let Some(next) = parsed.upcoming(chrono::Utc).next() {
                                if next_fire.is_none() || next < next_fire.unwrap() {
                                    next_fire = Some(next);
                                }
                                due.push((id.clone(), def.clone(), next));
                            }
                        }
                    }
                }
            }

            // Sleep until next fire time (millisecond precision, minimum 1s, cap 60s)
            let sleep_duration = if let Some(next) = next_fire {
                let diff_ms = (next - now).num_milliseconds().max(1000);
                Duration::from_millis((diff_ms as u64).min(60_000))
            } else {
                Duration::from_secs(60)
            };

            // Wait
            let cancelled = tokio::select! {
                _ = tokio::time::sleep(sleep_duration) => false,
                _ = cancel_rx.recv() => true,
            };

            if cancelled {
                eprintln!("[workflow] scheduler stopped");
                break;
            }

            // After waking, fire workflows whose target time has passed
            let now = chrono::Utc::now();
            for (id, def, target) in &due {
                // Target time hasn't arrived yet
                if *target > now + chrono::Duration::seconds(2) {
                    continue;
                }
                // Already fired for this exact time slot
                if let Some(prev) = last_fired.get(id) {
                    if (*target - *prev).num_seconds().abs() < 5 {
                        continue;
                    }
                }

                last_fired.insert(id.clone(), *target);

                let run_id = uuid::Uuid::new_v4().to_string();
                let eng = engine.clone();
                let d = db.clone();
                let a = app.clone();
                let pp = project_path.clone();
                let wf_id = id.clone();
                let wf_def = def.clone();

                eprintln!(
                    "[workflow] scheduler firing '{}' (target {:?}, now {:?})",
                    wf_id, target, now
                );

                tauri::async_runtime::spawn(async move {
                    if let Err(e) =
                        execute_workflow(&eng, &d, &a, &wf_def, &wf_id, &run_id, &pp).await
                    {
                        eprintln!("[workflow] scheduled execution error: {}", e);
                    }
                });
            }
        }
    });
}
