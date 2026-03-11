use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::AsyncReadExt;
use tokio::sync::broadcast;

use super::template::TemplateContext;
use super::types::{OutputDef, StepDef};

/// Execute a tool step via `claude -p` (supports both local and remote MCP servers)
pub(super) async fn execute_tool_step(
    step: &StepDef,
    ctx: &TemplateContext,
    project_path: &str,
    cancel: &broadcast::Sender<()>,
) -> Result<Value, String> {
    let tool_path = step
        .tool
        .as_deref()
        .ok_or("Missing tool field")?;

    // Parse "mcp/server_name/tool_name" → "mcp__server_name__tool_name"
    let parts: Vec<&str> = tool_path.splitn(3, '/').collect();
    if parts.len() != 3 || parts[0] != "mcp" {
        return Err(format!(
            "Invalid tool path '{}'. Expected 'mcp/server_name/tool_name'",
            tool_path
        ));
    }
    let claude_tool_name = format!("mcp__{}__{}", parts[1], parts[2]);

    // Render params
    let rendered_params = step
        .params
        .as_ref()
        .map(|p| ctx.render_value(p))
        .unwrap_or(json!({}));
    let params_json =
        serde_json::to_string_pretty(&rendered_params).map_err(|e| e.to_string())?;

    // Build prompt
    let prompt = format!(
        "Call the tool `{}` with exactly these arguments:\n{}\n\nReturn ONLY the raw tool result. No commentary, no explanation.",
        claude_tool_name, params_json
    );

    // Resolve PATH (macOS GUI apps don't inherit shell PATH)
    let path_env = resolve_shell_path();

    let mut cmd = tokio::process::Command::new("claude");
    cmd.args(["-p", &prompt]);
    cmd.args(["--output-format", "text"]);
    cmd.args(["--allowedTools", &claude_tool_name]);
    cmd.arg("--no-session-persistence");
    cmd.current_dir(project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    if let Some(ref path) = path_env {
        cmd.env("PATH", path);
    }

    eprintln!(
        "[workflow] executing tool step '{}' via claude -p (tool: {})",
        step.id, claude_tool_name
    );

    let output = spawn_with_cancel(&mut cmd, cancel, Duration::from_secs(300))
        .await
        .map_err(|e| match e.as_str() {
            "cancelled" => format!("Tool step '{}' cancelled", step.id),
            "timed out" => format!("Tool step '{}' timed out (300s)", step.id),
            _ => format!(
                "Failed to execute claude CLI: {}. Is Claude Code installed and in PATH?",
                e
            ),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude -p exited with {}: {}",
            output.status, stderr
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Try to parse as JSON to preserve structured results for downstream templates
    match serde_json::from_str::<Value>(&stdout) {
        Ok(val) => Ok(val),
        Err(_) => Ok(Value::String(stdout)),
    }
}

/// Execute an agent step (claude -p subprocess)
pub(super) async fn execute_agent_step(
    step: &StepDef,
    ctx: &TemplateContext,
    project_path: &str,
    cancel: &broadcast::Sender<()>,
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
    // Normalize allowed_tools: convert "mcp/server/tool" → "mcp__server__tool"
    if let Some(ref tools) = step.allowed_tools {
        let normalized: Vec<String> = tools
            .iter()
            .map(|t| normalize_tool_name(t))
            .collect();
        if !normalized.is_empty() {
            cmd.args(["--allowedTools", &normalized.join(",")]);
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

    let output = spawn_with_cancel(&mut cmd, cancel, Duration::from_secs(300))
        .await
        .map_err(|e| match e.as_str() {
            "cancelled" => format!("Agent step '{}' cancelled", step.id),
            "timed out" => format!("Agent step '{}' timed out (300s)", step.id),
            _ => format!(
                "Failed to execute claude CLI: {}. Is Claude Code installed and in PATH?",
                e
            ),
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
pub(super) async fn execute_outputs(
    outputs: &[OutputDef],
    ctx: &TemplateContext,
    project_path: &str,
) -> Result<(), String> {
    let project_root = std::path::Path::new(project_path)
        .canonicalize()
        .map_err(|e| format!("Failed to resolve project path: {}", e))?;

    for output in outputs {
        match output.output_type.as_str() {
            "document" => {
                if let Some(path_template) = &output.path {
                    let rendered_path = ctx.render(path_template);
                    let full_path = project_root.join(&rendered_path);

                    // Create parent directories so canonicalize works
                    if let Some(parent) = full_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| {
                            format!("Failed to create output directory: {}", e)
                        })?;
                    }

                    // Path traversal guard: ensure output stays within project
                    let canonical = full_path
                        .canonicalize()
                        .map_err(|e| format!("Failed to resolve output path: {}", e))?;
                    if !canonical.starts_with(&project_root) {
                        return Err(format!(
                            "Output path '{}' escapes project directory",
                            rendered_path
                        ));
                    }

                    // Use the last step's result as document content
                    let content = match ctx.last_step_result() {
                        Some(val) => super::template::value_to_string(val),
                        None => "Workflow completed with no step results.".to_string(),
                    };

                    std::fs::write(&canonical, &content).map_err(|e| {
                        format!("Failed to write output file {:?}: {}", canonical, e)
                    })?;

                    eprintln!("[workflow] wrote output to {:?}", canonical);
                }
            }
            other => {
                eprintln!("[workflow] unsupported output type: {}", other);
            }
        }
    }
    Ok(())
}

// ── Subprocess helpers ──

/// Spawn a child process and race it against a cancellation signal and timeout.
/// Returns the child's output on success, or an error string:
/// - "cancelled" if the cancel signal fired
/// - "timed out" if the timeout elapsed
/// - other strings for spawn/IO errors
async fn spawn_with_cancel(
    cmd: &mut tokio::process::Command,
    cancel: &broadcast::Sender<()>,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let mut cancel_rx = cancel.subscribe();

    // Take ownership of pipes so we can read them while waiting
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();

    tokio::select! {
        result = tokio::time::timeout(timeout, async {
            // Read stdout/stderr concurrently with waiting for exit
            let mut stdout_buf = Vec::new();
            let mut stderr_buf = Vec::new();

            let stdout_fut = async {
                if let Some(ref mut pipe) = stdout_pipe {
                    pipe.read_to_end(&mut stdout_buf).await.ok();
                }
            };
            let stderr_fut = async {
                if let Some(ref mut pipe) = stderr_pipe {
                    pipe.read_to_end(&mut stderr_buf).await.ok();
                }
            };
            let wait_fut = child.wait();

            let (status, _, _) = tokio::join!(wait_fut, stdout_fut, stderr_fut);
            let status = status.map_err(|e| e.to_string())?;

            Ok::<_, String>(std::process::Output { status, stdout: stdout_buf, stderr: stderr_buf })
        }) => {
            match result {
                Ok(Ok(output)) => Ok(output),
                Ok(Err(e)) => Err(e),
                Err(_) => {
                    let _ = child.kill().await;
                    Err("timed out".to_string())
                }
            }
        }
        _ = cancel_rx.recv() => {
            let _ = child.kill().await;
            Err("cancelled".to_string())
        }
    }
}

/// Normalize tool names: convert "mcp/server/tool" → "mcp__server__tool".
/// Already-normalized names (containing "__") are passed through unchanged.
fn normalize_tool_name(name: &str) -> String {
    let parts: Vec<&str> = name.splitn(3, '/').collect();
    if parts.len() == 3 && parts[0] == "mcp" {
        format!("mcp__{}__{}", parts[1], parts[2])
    } else {
        name.to_string()
    }
}

// ── Shell PATH resolution ──

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
