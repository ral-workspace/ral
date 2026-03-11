use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, oneshot};

use super::db::WorkflowDb;
use super::steps;
use super::template::TemplateContext;
use super::types::{StepDef, StepResult, WorkflowDef, WorkflowRun};

pub struct WorkflowEngine {
    /// Active run cancellation channels: run_id → sender
    running: HashMap<String, broadcast::Sender<()>>,
    /// Pending approval responses: "run_id:step_id" → oneshot sender
    pub(crate) pending_approvals: HashMap<String, oneshot::Sender<bool>>,
    /// Scheduler cancel handles: project_path → (sender, ref_count)
    scheduler_cancels: HashMap<String, (broadcast::Sender<()>, usize)>,
}

impl WorkflowEngine {
    pub fn new() -> Self {
        Self {
            running: HashMap::new(),
            pending_approvals: HashMap::new(),
            scheduler_cancels: HashMap::new(),
        }
    }

    pub fn register_run(
        &mut self,
        run_id: &str,
    ) -> (broadcast::Sender<()>, broadcast::Receiver<()>) {
        let (tx, rx) = broadcast::channel(1);
        self.running.insert(run_id.to_string(), tx.clone());
        (tx, rx)
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

    /// Register an approval request and return the receiver to await the response.
    pub fn register_approval(&mut self, run_id: &str, step_id: &str) -> oneshot::Receiver<bool> {
        let key = format!("{}:{}", run_id, step_id);
        let (tx, rx) = oneshot::channel();
        self.pending_approvals.insert(key, tx);
        rx
    }

    /// Respond to a pending approval. Returns Err if no pending approval found.
    pub fn respond_approval(&mut self, run_id: &str, approved: bool) -> Result<(), String> {
        // Find the first pending approval for this run_id
        let key = self
            .pending_approvals
            .keys()
            .find(|k| k.starts_with(&format!("{}:", run_id)))
            .cloned();

        if let Some(key) = key {
            if let Some(tx) = self.pending_approvals.remove(&key) {
                let _ = tx.send(approved);
                Ok(())
            } else {
                Err("Approval sender already consumed".to_string())
            }
        } else {
            Err(format!("No pending approval for run '{}'", run_id))
        }
    }

    pub fn stop_scheduler(&mut self, project_path: &str) {
        if let Some((tx, ref_count)) = self.scheduler_cancels.get_mut(project_path) {
            *ref_count = ref_count.saturating_sub(1);
            if *ref_count == 0 {
                let _ = tx.send(());
                self.scheduler_cancels.remove(project_path);
            }
        }
    }

    #[allow(dead_code)]
    pub fn stop_all_schedulers(&mut self) {
        for (_, (tx, _)) in self.scheduler_cancels.drain() {
            let _ = tx.send(());
        }
    }

    /// Returns true if a new scheduler was started, false if ref count was incremented.
    pub fn set_scheduler_cancel(&mut self, project_path: String, tx: broadcast::Sender<()>) -> bool {
        if let Some((_, ref_count)) = self.scheduler_cancels.get_mut(&project_path) {
            *ref_count += 1;
            false
        } else {
            self.scheduler_cancels.insert(project_path, (tx, 1));
            true
        }
    }
}

/// Execute a single step (tool or agent), used by retry loop.
async fn execute_step(
    step: &StepDef,
    ctx: &TemplateContext,
    project_path: &str,
    cancel: &broadcast::Sender<()>,
) -> Result<serde_json::Value, String> {
    if step.tool.is_some() {
        steps::execute_tool_step(step, ctx, project_path, cancel).await
    } else if step.agent.is_some() {
        steps::execute_agent_step(step, ctx, project_path, cancel).await
    } else {
        Err(format!("Step '{}' has neither tool nor agent", step.id))
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
    let (cancel_tx, mut cancel_rx) = {
        let mut eng = engine.lock().map_err(|e| e.to_string())?;
        eng.register_run(run_id)
    };

    // Create initial run record
    let mut run = WorkflowRun {
        id: run_id.to_string(),
        workflow_id: workflow_id.to_string(),
        project_path: Some(project_path.to_string()),
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
        json!({ "workflow_id": workflow_id, "run_id": run_id, "project_path": project_path }),
    );

    // Initialize template context
    let last_run = db.get_last_run(workflow_id, Some(project_path)).await.ok().flatten();
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

        // Approval gate
        if step.approve {
            let _ = app.emit(
                "workflow-approval-pending",
                json!({
                    "run_id": run_id,
                    "workflow_id": workflow_id,
                    "workflow_name": workflow.name,
                    "step_id": step.id,
                    "step_tool": step.tool,
                    "step_agent": step.agent,
                    "project_path": project_path,
                }),
            );

            let approval_rx = {
                let mut eng = engine.lock().map_err(|e| e.to_string())?;
                eng.register_approval(run_id, &step.id)
            };

            // Wait for either approval response or cancellation
            let approved = tokio::select! {
                result = approval_rx => {
                    match result {
                        Ok(v) => v,
                        Err(_) => false, // sender dropped = treat as rejected
                    }
                }
                _ = cancel_rx.recv() => {
                    // Cancelled while waiting for approval
                    false
                }
            };

            // Clean up approval state
            {
                let mut eng = engine.lock().map_err(|e| e.to_string())?;
                let key = format!("{}:{}", run_id, step.id);
                eng.pending_approvals.remove(&key);
            }

            // Emit approval resolved event
            let _ = app.emit(
                "workflow-approval-resolved",
                json!({
                    "run_id": run_id,
                    "step_id": step.id,
                    "approved": approved,
                    "project_path": project_path,
                }),
            );

            if !approved {
                run.status = "cancelled".to_string();
                run.error = Some(format!("Step '{}' was rejected", step.id));
                failed = true;
                break;
            }
        }

        let step_start = chrono::Utc::now().to_rfc3339();

        // Retry loop
        let max_retries = step.retry.unwrap_or(0);
        let mut last_error: Option<String> = None;
        let mut result: Result<serde_json::Value, String> = Err("not executed".to_string());

        for attempt in 0..=max_retries {
            // Exponential backoff for retries
            if attempt > 0 {
                let delay_secs = 2u64.pow(attempt - 1);
                eprintln!(
                    "[workflow] step '{}' retry {}/{} after {}s",
                    step.id, attempt, max_retries, delay_secs
                );
                tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;

                // Check cancellation before retry
                if cancel_rx.try_recv().is_ok() {
                    run.status = "cancelled".to_string();
                    run.error = Some("Cancelled by user".to_string());
                    failed = true;
                    break;
                }
            }

            result = execute_step(step, &ctx, project_path, &cancel_tx).await;
            if result.is_ok() {
                break;
            }
            last_error = result.as_ref().err().cloned();
        }

        if failed {
            break;
        }

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
                let error_msg = last_error.unwrap_or(e);
                run.steps.push(StepResult {
                    step_id: step.id.clone(),
                    status: "failure".to_string(),
                    result: None,
                    error: Some(error_msg.clone()),
                    started_at: step_start,
                    finished_at: step_end,
                });
                run.status = "failure".to_string();
                run.error = Some(format!("Step '{}' failed: {}", step.id, error_msg));
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
            "project_path": project_path,
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
