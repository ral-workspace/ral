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

    // Store cancel handle
    {
        if let Ok(mut eng) = engine.lock() {
            eng.stop_scheduler(); // Stop any existing scheduler
            eng.set_scheduler_cancel(cancel_tx);
        }
    }

    tauri::async_runtime::spawn(async move {
        eprintln!(
            "[workflow] scheduler started for project: {}",
            project_path
        );

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
            let mut fire_candidates: Vec<(String, WorkflowDef)> = Vec::new();

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
                                // Check if this should fire now (within 1s window)
                                let diff = (next - now).num_seconds();
                                if diff <= 0 {
                                    fire_candidates.push((id.clone(), def.clone()));
                                }
                            }
                        }
                    }
                }
            }

            // Fire due workflows
            for (wf_id, wf_def) in fire_candidates {
                let run_id = uuid::Uuid::new_v4().to_string();
                let eng = engine.clone();
                let d = db.clone();
                let a = app.clone();
                let pp = project_path.clone();

                tauri::async_runtime::spawn(async move {
                    if let Err(e) =
                        execute_workflow(&eng, &d, &a, &wf_def, &wf_id, &run_id, &pp).await
                    {
                        eprintln!("[workflow] scheduled execution error: {}", e);
                    }
                });
            }

            // Sleep until next fire or 60s (whichever is sooner)
            let sleep_duration = if let Some(next) = next_fire {
                let secs = (next - now).num_seconds().max(1) as u64;
                Duration::from_secs(secs.min(60))
            } else {
                Duration::from_secs(60)
            };

            tokio::select! {
                _ = tokio::time::sleep(sleep_duration) => {}
                _ = cancel_rx.recv() => {
                    eprintln!("[workflow] scheduler stopped");
                    break;
                }
            }
        }
    });
}
