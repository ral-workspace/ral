use chrono::{Local, NaiveTime, Timelike, Utc};
use cron::Schedule;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::Notify;
use tauri::async_runtime::JoinHandle;

// ── Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub schedule: JobSchedule,
    pub action: JobAction,
    #[serde(default)]
    pub notification: NotificationConfig,
    #[serde(default = "now_iso")]
    pub created_at: String,
    #[serde(default = "now_iso")]
    pub updated_at: String,
}

fn default_source() -> String {
    "user".into()
}
fn default_true() -> bool {
    true
}
fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum JobSchedule {
    Interval {
        every: u32,
        unit: IntervalUnit,
    },
    Daily {
        at: String,
    },
    Weekly {
        day: String,
        at: String,
    },
    Monthly {
        day_of_month: u32,
        at: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntervalUnit {
    Minutes,
    Hours,
    Days,
    Weeks,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum JobAction {
    Shell {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default = "default_timeout")]
        timeout_seconds: u64,
    },
}

fn default_timeout() -> u64 {
    300
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationConfig {
    #[serde(default = "default_true")]
    pub on_success: bool,
    #[serde(default = "default_true")]
    pub on_failure: bool,
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            on_success: true,
            on_failure: true,
        }
    }
}

/// Input type for creating/updating jobs (no id/timestamps).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewJob {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub schedule: JobSchedule,
    pub action: JobAction,
    #[serde(default)]
    pub notification: NotificationConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRun {
    pub id: String,
    pub job_id: String,
    pub job_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub status: String, // "success" | "failure" | "timeout" | "cancelled"
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JobsFile {
    version: u32,
    jobs: Vec<JobDef>,
}

// ── Schedule → cron conversion ──

pub fn schedule_to_cron(schedule: &JobSchedule) -> Result<String, String> {
    match schedule {
        JobSchedule::Interval { every, unit } => {
            match unit {
                IntervalUnit::Minutes => Ok(format!("0 */{} * * * *", every)),
                IntervalUnit::Hours => Ok(format!("0 0 */{} * * *", every)),
                IntervalUnit::Days => Ok(format!("0 0 0 */{} * *", every)),
                IntervalUnit::Weeks => {
                    // cron doesn't have native weeks; approximate with days
                    Ok(format!("0 0 0 */{} * *", every * 7))
                }
            }
        }
        JobSchedule::Daily { at } => {
            let t = parse_time(at)?;
            Ok(format!("0 {} {} * * *", t.minute(), t.hour()))
        }
        JobSchedule::Weekly { day, at } => {
            let t = parse_time(at)?;
            let dow = day_to_cron(day)?;
            Ok(format!("0 {} {} * * {}", t.minute(), t.hour(), dow))
        }
        JobSchedule::Monthly { day_of_month, at } => {
            let t = parse_time(at)?;
            Ok(format!("0 {} {} {} * *", t.minute(), t.hour(), day_of_month))
        }
    }
}

fn parse_time(s: &str) -> Result<NaiveTime, String> {
    NaiveTime::parse_from_str(s, "%H:%M").map_err(|e| format!("Invalid time '{}': {}", s, e))
}

fn day_to_cron(day: &str) -> Result<&str, String> {
    match day.to_lowercase().as_str() {
        "sunday" | "sun" => Ok("0"),
        "monday" | "mon" => Ok("1"),
        "tuesday" | "tue" => Ok("2"),
        "wednesday" | "wed" => Ok("3"),
        "thursday" | "thu" => Ok("4"),
        "friday" | "fri" => Ok("5"),
        "saturday" | "sat" => Ok("6"),
        _ => Err(format!("Unknown day: {}", day)),
    }
}

// ── Manager ──

pub struct SchedulerManager {
    jobs: Vec<JobDef>,
    history: Vec<JobRun>,
    running: HashMap<String, JoinHandle<()>>,
    notify: Arc<Notify>,
    jobs_path: PathBuf,
}

impl SchedulerManager {
    pub fn new() -> Self {
        let jobs_path = dirs::home_dir()
            .unwrap_or_default()
            .join(".helm")
            .join("jobs.json");

        let mut mgr = Self {
            jobs: Vec::new(),
            history: Vec::new(),
            running: HashMap::new(),
            notify: Arc::new(Notify::new()),
            jobs_path,
        };
        mgr.load_from_file();
        mgr
    }

    // ── CRUD ──

    pub fn list_jobs(&self) -> Vec<JobDef> {
        self.jobs.clone()
    }

    pub fn get_job(&self, id: &str) -> Option<&JobDef> {
        self.jobs.iter().find(|j| j.id == id)
    }

    pub fn create_job(&mut self, new: NewJob) -> Result<JobDef, String> {
        let now = now_iso();
        let job = JobDef {
            id: uuid::Uuid::new_v4().to_string(),
            name: new.name,
            description: new.description,
            source: "user".into(),
            enabled: true,
            schedule: new.schedule,
            action: new.action,
            notification: new.notification,
            created_at: now.clone(),
            updated_at: now,
        };
        // Validate cron
        let cron_expr = schedule_to_cron(&job.schedule)?;
        Schedule::from_str(&cron_expr).map_err(|e| format!("Invalid schedule: {}", e))?;

        self.jobs.push(job.clone());
        self.save_to_file()?;
        Ok(job)
    }

    pub fn update_job(&mut self, id: &str, new: NewJob) -> Result<JobDef, String> {
        let cron_expr = schedule_to_cron(&new.schedule)?;
        Schedule::from_str(&cron_expr).map_err(|e| format!("Invalid schedule: {}", e))?;

        let job = self
            .jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or("Job not found")?;
        job.name = new.name;
        job.description = new.description;
        job.schedule = new.schedule;
        job.action = new.action;
        job.notification = new.notification;
        job.updated_at = now_iso();
        let updated = job.clone();
        self.save_to_file()?;
        Ok(updated)
    }

    pub fn delete_job(&mut self, id: &str) -> Result<(), String> {
        let len = self.jobs.len();
        self.jobs.retain(|j| j.id != id);
        if self.jobs.len() == len {
            return Err("Job not found".into());
        }
        // Cancel if running
        if let Some(handle) = self.running.remove(id) {
            handle.abort();
        }
        self.save_to_file()
    }

    pub fn toggle_job(&mut self, id: &str, enabled: bool) -> Result<(), String> {
        let job = self
            .jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or("Job not found")?;
        job.enabled = enabled;
        job.updated_at = now_iso();
        if !enabled {
            if let Some(handle) = self.running.remove(id) {
                handle.abort();
            }
        }
        self.save_to_file()
    }

    pub fn cancel_job(&mut self, id: &str) -> Result<(), String> {
        if let Some(handle) = self.running.remove(id) {
            handle.abort();
            Ok(())
        } else {
            Err("Job is not running".into())
        }
    }

    pub fn get_history(&self, job_id: Option<&str>, limit: usize) -> Vec<JobRun> {
        let iter = self.history.iter().rev();
        match job_id {
            Some(id) => iter.filter(|r| r.job_id == id).take(limit).cloned().collect(),
            None => iter.take(limit).cloned().collect(),
        }
    }

    // ── File I/O ──

    fn load_from_file(&mut self) {
        if let Ok(data) = std::fs::read_to_string(&self.jobs_path) {
            if let Ok(file) = serde_json::from_str::<JobsFile>(&data) {
                self.jobs = file.jobs;
            }
        }
    }

    fn save_to_file(&self) -> Result<(), String> {
        if let Some(parent) = self.jobs_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let file = JobsFile {
            version: 1,
            jobs: self.jobs.clone(),
        };
        let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
        std::fs::write(&self.jobs_path, json).map_err(|e| e.to_string())
    }

    // ── Notify wake-up ──

    pub fn wake(&self) {
        self.notify.notify_one();
    }

    pub fn notify_handle(&self) -> Arc<Notify> {
        self.notify.clone()
    }

    // ── Track running tasks ──

    pub fn set_running(&mut self, job_id: String, handle: JoinHandle<()>) {
        self.running.insert(job_id, handle);
    }

    pub fn clear_running(&mut self, job_id: &str) {
        self.running.remove(job_id);
    }

    pub fn is_running(&self, job_id: &str) -> bool {
        self.running.contains_key(job_id)
    }

    pub fn add_history(&mut self, run: JobRun) {
        self.history.push(run);
        // Keep last 200
        if self.history.len() > 200 {
            self.history.drain(..self.history.len() - 200);
        }
    }

    // ── Static helpers for use from Tauri commands ──

    /// Execute a single job and record the result. Called from a spawned task.
    pub async fn execute_job_static(
        state: &Arc<std::sync::Mutex<SchedulerManager>>,
        job: &JobDef,
        app: &AppHandle,
    ) {
        let job_id = job.id.clone();
        let job_name = job.name.clone();
        let notification = job.notification.clone();

        // Mark as running
        // (We can't hold the lock across await, so we don't track JoinHandle here
        //  for run-now. The scheduler loop tracks scheduled runs.)

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

// ── Scheduler loop ──

pub fn start_scheduler_loop(
    state: Arc<std::sync::Mutex<SchedulerManager>>,
    app: AppHandle,
) {
    let notify = {
        let mgr = state.lock().unwrap();
        mgr.notify_handle()
    };

    tauri::async_runtime::spawn(async move {
        loop {
            // Compute next fire time across all enabled jobs
            let (next_fire, jobs_to_run) = {
                let mgr = state.lock().unwrap();
                compute_next_fires(&mgr.jobs)
            };

            // Run any jobs that are due now
            for job in &jobs_to_run {
                let state_clone = state.clone();
                let app_clone = app.clone();
                let job_clone = job.clone();
                let job_id = job.id.clone();

                // Skip if already running
                {
                    let mgr = state.lock().unwrap();
                    if mgr.is_running(&job_id) {
                        continue;
                    }
                }

                let handle = tauri::async_runtime::spawn(async move {
                    SchedulerManager::execute_job_static(
                        &state_clone,
                        &job_clone,
                        &app_clone,
                    )
                    .await;
                });

                if let Ok(mut mgr) = state.lock() {
                    mgr.set_running(job_id, handle);
                }
            }

            // Sleep until next fire or until woken by a CRUD operation
            match next_fire {
                Some(duration) => {
                    tokio::select! {
                        _ = tokio::time::sleep(duration) => {},
                        _ = notify.notified() => {},
                    }
                }
                None => {
                    // No jobs scheduled; wait for wake-up
                    notify.notified().await;
                }
            }
        }
    });
}

/// Returns (time until next fire, jobs that should fire now).
fn compute_next_fires(jobs: &[JobDef]) -> (Option<std::time::Duration>, Vec<JobDef>) {
    let now = Local::now();
    let mut nearest: Option<chrono::DateTime<Local>> = None;
    let mut due_jobs = Vec::new();

    for job in jobs {
        if !job.enabled {
            continue;
        }
        let cron_expr = match schedule_to_cron(&job.schedule) {
            Ok(expr) => expr,
            Err(_) => continue,
        };
        let schedule = match Schedule::from_str(&cron_expr) {
            Ok(s) => s,
            Err(_) => continue,
        };

        if let Some(next) = schedule.upcoming(Local).next() {
            // If the next fire is within 1 second, consider it "now"
            let until = next - now;
            if until.num_seconds() <= 1 {
                due_jobs.push(job.clone());
            } else {
                match &nearest {
                    None => nearest = Some(next),
                    Some(n) if next < *n => nearest = Some(next),
                    _ => {}
                }
            }
        }
    }

    let duration = nearest.map(|n| {
        let d = n - now;
        d.to_std().unwrap_or(std::time::Duration::from_secs(1))
    });

    (duration, due_jobs)
}
