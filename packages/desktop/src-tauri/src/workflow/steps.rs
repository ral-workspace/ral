use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{json, Value};

use super::template::TemplateContext;
use super::types::{OutputDef, StepDef};

/// Execute a tool step via `claude -p` (supports both local and remote MCP servers)
pub(super) async fn execute_tool_step(
    step: &StepDef,
    ctx: &TemplateContext,
    project_path: &str,
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

    let output = tokio::time::timeout(Duration::from_secs(300), cmd.output())
        .await
        .map_err(|_| format!("Tool step '{}' timed out (300s)", step.id))?
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
pub(super) async fn execute_outputs(
    outputs: &[OutputDef],
    ctx: &TemplateContext,
    project_path: &str,
) -> Result<(), String> {
    for output in outputs {
        match output.output_type.as_str() {
            "document" => {
                if let Some(path_template) = &output.path {
                    let rendered_path = ctx.render(path_template);
                    let full_path = std::path::Path::new(project_path).join(&rendered_path);

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
