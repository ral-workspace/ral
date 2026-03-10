use chrono::Utc;
use serde_json;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

use super::manager::SchedulerManager;
use super::types::{JobAction, JobDef, JobRun};

// ── Job execution ──

/// Execute a single job and record the result.
pub async fn execute_job(
    state: &std::sync::Arc<std::sync::Mutex<SchedulerManager>>,
    job: &JobDef,
    app: &AppHandle,
) {
    let job_id = job.id.clone();
    let job_name = job.name.clone();
    let notification = job.notification.clone();

    let started_at = Utc::now().to_rfc3339();
    let _ = app.emit("scheduler-job-started", serde_json::json!({
        "job_id": &job_id,
        "job_name": &job_name,
    }));

    let result = execute_shell_action(&job.action).await;

    let finished_at = Utc::now().to_rfc3339();

    let run = JobRun {
        id: uuid::Uuid::new_v4().to_string(),
        job_id: job_id.clone(),
        job_name: job_name.clone(),
        started_at,
        finished_at,
        status: result.status.clone(),
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
    };

    // Record history
    if let Ok(mut mgr) = state.lock() {
        mgr.add_history(run.clone());
        mgr.clear_running(&job_id);
    }

    // Emit completion event
    let _ = app.emit("scheduler-job-completed", &run);

    // OS notification
    let should_notify = match run.status.as_str() {
        "success" => notification.on_success,
        _ => notification.on_failure,
    };
    if should_notify {
        send_os_notification(app, &job_name, &run.status);
    }
}

// ── Shell execution ──

struct ExecResult {
    status: String,
    stdout: Option<String>,
    stderr: Option<String>,
    exit_code: Option<i32>,
}

async fn execute_shell_action(action: &JobAction) -> ExecResult {
    let JobAction::Shell {
        command,
        args,
        cwd,
        timeout_seconds,
    } = action;

    let mut cmd = Command::new(command);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let timeout = std::time::Duration::from_secs(*timeout_seconds);

    match tokio::time::timeout(timeout, cmd.output()).await {
        Ok(Ok(output)) => {
            let stdout = truncate_output(&output.stdout);
            let stderr = truncate_output(&output.stderr);
            let exit_code = output.status.code();
            let status = if output.status.success() {
                "success"
            } else {
                "failure"
            };
            ExecResult {
                status: status.into(),
                stdout: Some(stdout),
                stderr: Some(stderr),
                exit_code,
            }
        }
        Ok(Err(e)) => ExecResult {
            status: "failure".into(),
            stdout: None,
            stderr: Some(format!("Failed to execute: {}", e)),
            exit_code: None,
        },
        Err(_) => ExecResult {
            status: "timeout".into(),
            stdout: None,
            stderr: Some(format!("Timed out after {}s", timeout_seconds)),
            exit_code: None,
        },
    }
}

fn truncate_output(bytes: &[u8]) -> String {
    let s = String::from_utf8_lossy(bytes);
    if s.len() > 10_000 {
        format!("{}... (truncated)", &s[..10_000])
    } else {
        s.into_owned()
    }
}

// ── OS notification ──

fn send_os_notification(app: &AppHandle, job_name: &str, status: &str) {
    use tauri_plugin_notification::NotificationExt;
    let (title, body): (String, String) = match status {
        "success" => (
            format!("{} completed", job_name),
            "Job finished successfully.".into(),
        ),
        "timeout" => (
            format!("{} timed out", job_name),
            "Job exceeded the timeout limit.".into(),
        ),
        _ => (
            format!("{} failed", job_name),
            "Job encountered an error.".into(),
        ),
    };
    let _ = app.notification().builder().title(&title).body(&body).show();
}
