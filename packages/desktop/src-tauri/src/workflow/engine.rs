use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use crate::mcp;

use super::db::WorkflowDb;
use super::template::TemplateContext;
use super::types::{OutputDef, StepDef, StepResult, WorkflowDef, WorkflowRun};

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
            execute_tool_step(step, &ctx, app).await
        } else if step.agent.is_some() {
            execute_agent_step(step, &ctx, project_path).await
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
        if let Err(e) = execute_outputs(&workflow.output, &ctx, project_path).await {
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

/// Execute a tool step (MCP JSON-RPC call via global McpState)
async fn execute_tool_step(
    step: &StepDef,
    ctx: &TemplateContext,
    app: &AppHandle,
) -> Result<Value, String> {
    use tauri::Manager;

    let tool_path = step
        .tool
        .as_deref()
        .ok_or("Missing tool field")?;

    // Parse "mcp/server_name/tool_name"
    let parts: Vec<&str> = tool_path.splitn(3, '/').collect();
    if parts.len() != 3 || parts[0] != "mcp" {
        return Err(format!(
            "Invalid tool path '{}'. Expected 'mcp/server_name/tool_name'",
            tool_path
        ));
    }
    let server_name = parts[1];
    let tool_name = parts[2];

    // Resolve server URL from global McpState registry
    let mcp_state = app.state::<Mutex<mcp::McpState>>();
    let (http, server_url) = {
        let s = mcp_state.lock().map_err(|e| e.to_string())?;
        let url = s
            .get_server_url(server_name)
            .ok_or_else(|| format!("MCP server '{}' not connected. Connect it in Settings first.", server_name))?;
        (s.http_client(), url)
    };

    // Initialize a new MCP session for this workflow step
    let (_, session_id) = mcp::jsonrpc_request(
        &http,
        &server_url,
        None,
        "initialize",
        json!({
            "protocolVersion": "2025-11-21",
            "capabilities": {},
            "clientInfo": { "name": "Helm Workflow", "version": "1.0.0" }
        }),
        1,
    )
    .await?;

    // Send initialized notification
    mcp::jsonrpc_notify(&http, &server_url, session_id.as_deref(), "notifications/initialized")
        .await?;

    // Render params
    let rendered_params = step
        .params
        .as_ref()
        .map(|p| ctx.render_value(p))
        .unwrap_or(json!({}));

    // Call tool
    let (result, _) = mcp::jsonrpc_request(
        &http,
        &server_url,
        session_id.as_deref(),
        "tools/call",
        json!({
            "name": tool_name,
            "arguments": rendered_params,
        }),
        2,
    )
    .await?;

    Ok(result)
}

/// Execute an agent step (claude -p subprocess)
async fn execute_agent_step(
    step: &StepDef,
    ctx: &TemplateContext,
    project_path: &str,
) -> Result<Value, String> {
    let prompt = step
        .prompt
        .as_deref()
        .ok_or("Missing prompt field for agent step")?;

    let rendered_prompt = ctx.render(prompt);

    // Resolve PATH (macOS GUI apps don't inherit shell PATH)
    let path_env = resolve_shell_path();

    let mut cmd = tokio::process::Command::new("claude");
    cmd.args(["-p", &rendered_prompt]);
    cmd.args(["--output-format", "text"]);
    if let Some(ref tools) = step.allowed_tools {
        if !tools.is_empty() {
            cmd.args(["--allowedTools", &tools.join(",")]);
        }
    }
    cmd.arg("--no-session-persistence");
    cmd.current_dir(project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    if let Some(ref path) = path_env {
        cmd.env("PATH", path);
    }

    eprintln!(
        "[workflow] executing agent step '{}' with claude -p",
        step.id
    );

    let output = tokio::time::timeout(Duration::from_secs(300), cmd.output())
        .await
        .map_err(|_| format!("Agent step '{}' timed out (300s)", step.id))?
        .map_err(|e| {
            format!(
                "Failed to execute claude CLI: {}. Is Claude Code installed and in PATH?",
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude -p exited with {}: {}",
            output.status, stderr
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(Value::String(stdout))
}

/// Execute output definitions
async fn execute_outputs(
    outputs: &[OutputDef],
    ctx: &TemplateContext,
    project_path: &str,
) -> Result<(), String> {
    for output in outputs {
        match output.output_type.as_str() {
            "document" => {
                if let Some(path_template) = &output.path {
                    let rendered_path = ctx.render(path_template);
                    let full_path = Path::new(project_path).join(&rendered_path);

                    // Create parent directories
                    if let Some(parent) = full_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| {
                            format!("Failed to create output directory: {}", e)
                        })?;
                    }

                    // Use the last step's result as document content
                    let content = match ctx.last_step_result() {
                        Some(val) => super::template::value_to_string(val),
                        None => "Workflow completed with no step results.".to_string(),
                    };

                    std::fs::write(&full_path, &content).map_err(|e| {
                        format!("Failed to write output file {:?}: {}", full_path, e)
                    })?;

                    eprintln!("[workflow] wrote output to {:?}", full_path);
                }
            }
            other => {
                eprintln!("[workflow] unsupported output type: {}", other);
            }
        }
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

// ── Shell PATH resolution (same pattern as acp/manager.rs) ──

static SHELL_PATH: OnceLock<Option<String>> = OnceLock::new();

fn resolve_shell_path() -> Option<String> {
    SHELL_PATH
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let output = std::process::Command::new(&shell)
                .args(["-l", "-c", "echo $PATH"])
                .output()
                .ok()?;
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(path)
            }
        })
        .clone()
}
