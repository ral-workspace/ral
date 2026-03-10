use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use super::db::WorkflowDb;
use super::steps;
use super::template::TemplateContext;
use super::types::{StepResult, WorkflowDef, WorkflowRun};

pub struct WorkflowEngine {
    /// Active run cancellation channels: run_id → sender
    running: HashMap<String, broadcast::Sender<()>>,
    /// Scheduler cancel handle
    scheduler_cancel: Option<broadcast::Sender<()>>,
}

impl WorkflowEngine {
    pub fn new() -> Self {
        Self {
            running: HashMap::new(),
            scheduler_cancel: None,
        }
    }

    pub fn register_run(&mut self, run_id: &str) -> broadcast::Receiver<()> {
        let (tx, rx) = broadcast::channel(1);
        self.running.insert(run_id.to_string(), tx);
        rx
    }

    pub fn cancel(&self, run_id: &str) -> Result<(), String> {
        if let Some(tx) = self.running.get(run_id) {
            let _ = tx.send(());
            Ok(())
        } else {
            Err(format!("Run '{}' not found or already finished", run_id))
        }
    }

    pub fn clear_run(&mut self, run_id: &str) {
        self.running.remove(run_id);
    }

    pub fn stop_scheduler(&mut self) {
        if let Some(tx) = self.scheduler_cancel.take() {
            let _ = tx.send(());
        }
    }

    pub fn set_scheduler_cancel(&mut self, tx: broadcast::Sender<()>) {
        self.scheduler_cancel = Some(tx);
    }
}

/// Execute a workflow (called from spawn)
pub async fn execute_workflow(
    engine: &Arc<Mutex<WorkflowEngine>>,
    db: &Arc<WorkflowDb>,
    app: &AppHandle,
    workflow: &WorkflowDef,
    workflow_id: &str,
    run_id: &str,
    project_path: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Register cancel channel
    let mut cancel_rx = {
        let mut eng = engine.lock().map_err(|e| e.to_string())?;
        eng.register_run(run_id)
    };

    // Create initial run record
    let mut run = WorkflowRun {
        id: run_id.to_string(),
        workflow_id: workflow_id.to_string(),
        status: "running".to_string(),
        started_at: now.clone(),
        finished_at: None,
        steps: Vec::new(),
        error: None,
    };
    db.insert_run(&run).await?;

    // Emit start event
    let _ = app.emit(
        "workflow-run-started",
        json!({ "workflow_id": workflow_id, "run_id": run_id }),
    );

    // Initialize template context
    let last_run = db.get_last_run(workflow_id).await.ok().flatten();
    let last_run_at = last_run.and_then(|r| {
        if r.id == run_id {
            None // Don't use current run as "last"
        } else {
            Some(r.started_at)
        }
    });
    let mut ctx = TemplateContext::new(last_run_at);

    // Execute steps
    let mut failed = false;
    for step in &workflow.steps {
        // Check cancellation
        if cancel_rx.try_recv().is_ok() {
            run.status = "cancelled".to_string();
            run.error = Some("Cancelled by user".to_string());
            failed = true;
            break;
        }

        let step_start = chrono::Utc::now().to_rfc3339();

        let result = if step.tool.is_some() {
            steps::execute_tool_step(step, &ctx, app).await
        } else if step.agent.is_some() {
            steps::execute_agent_step(step, &ctx, project_path).await
        } else {
            Err(format!("Step '{}' has neither tool nor agent", step.id))
        };

        let step_end = chrono::Utc::now().to_rfc3339();

        match result {
            Ok(value) => {
                let preview = super::template::value_to_string(&value);
                let truncated: String = preview.chars().take(200).collect();
                eprintln!("[workflow] step '{}' result: {}", step.id, truncated);
                ctx.set_step_result(&step.id, value.clone());
                run.steps.push(StepResult {
                    step_id: step.id.clone(),
                    status: "success".to_string(),
                    result: Some(value),
                    error: None,
                    started_at: step_start,
                    finished_at: step_end,
                });
            }
            Err(e) => {
                run.steps.push(StepResult {
                    step_id: step.id.clone(),
                    status: "failure".to_string(),
                    result: None,
                    error: Some(e.clone()),
                    started_at: step_start,
                    finished_at: step_end,
                });
                run.status = "failure".to_string();
                run.error = Some(format!("Step '{}' failed: {}", step.id, e));
                failed = true;
                break;
            }
        }

        // Emit step completed
        let _ = app.emit(
            "workflow-step-completed",
            json!({
                "run_id": run_id,
                "step_id": step.id,
                "status": run.steps.last().map(|s| s.status.as_str()).unwrap_or("unknown"),
            }),
        );
    }

    // Execute outputs (only on success)
    if !failed {
        if let Err(e) = steps::execute_outputs(&workflow.output, &ctx, project_path).await {
            eprintln!("[workflow] output error: {}", e);
            // Non-fatal: workflow still succeeded
        }
        run.status = "success".to_string();
    }

    run.finished_at = Some(chrono::Utc::now().to_rfc3339());
    db.update_run(&run).await?;

    // Emit completion
    let _ = app.emit(
        "workflow-run-completed",
        json!({
            "run_id": run_id,
            "workflow_id": workflow_id,
            "status": run.status,
        }),
    );

    // OS notification
    let _ = send_notification(app, &workflow.name, &run.status);

    // Cleanup
    {
        let mut eng = engine.lock().map_err(|e| e.to_string())?;
        eng.clear_run(run_id);
    }

    Ok(())
}

/// Send OS notification
fn send_notification(app: &AppHandle, workflow_name: &str, status: &str) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let title = format!("Workflow: {}", workflow_name);
    let body = match status {
        "success" => "Completed successfully",
        "failure" => "Failed",
        "cancelled" => "Cancelled",
        _ => status,
    };

    app.notification()
        .builder()
        .title(&title)
        .body(body)
        .show()
        .map_err(|e| format!("Notification error: {}", e))?;

    Ok(())
}
