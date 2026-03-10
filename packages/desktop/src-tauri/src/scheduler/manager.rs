use chrono::{Local, NaiveTime, Timelike};
use cron::Schedule;
use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Notify;
use tauri::async_runtime::JoinHandle;

use super::types::{JobDef, JobRun, JobSchedule, JobsFile, NewJob, IntervalUnit, now_iso};
use super::execution;

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
                    execution::execute_job(
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
