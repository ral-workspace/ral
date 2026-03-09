pub(crate) mod manager;

use std::sync::{Arc, Mutex};
use tauri::State;
pub(crate) use manager::SchedulerManager;

use manager::{JobDef, JobRun, NewJob};

#[tauri::command]
pub(crate) async fn scheduler_list_jobs(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
) -> Result<Vec<JobDef>, String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    Ok(mgr.list_jobs())
}

#[tauri::command]
pub(crate) async fn scheduler_create_job(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    job: NewJob,
) -> Result<JobDef, String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let job_def = mgr.create_job(job)?;
    mgr.wake();
    Ok(job_def)
}

#[tauri::command]
pub(crate) async fn scheduler_update_job(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    id: String,
    job: NewJob,
) -> Result<JobDef, String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let job_def = mgr.update_job(&id, job)?;
    mgr.wake();
    Ok(job_def)
}

#[tauri::command]
pub(crate) async fn scheduler_delete_job(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    id: String,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.delete_job(&id)?;
    mgr.wake();
    Ok(())
}

#[tauri::command]
pub(crate) async fn scheduler_toggle_job(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.toggle_job(&id, enabled)?;
    mgr.wake();
    Ok(())
}

#[tauri::command]
pub(crate) async fn scheduler_run_job_now(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let job = {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.get_job(&id).ok_or("Job not found")?.clone()
    };
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        SchedulerManager::execute_job_static(&state_clone, &job, &app).await;
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn scheduler_cancel_job(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    id: String,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.cancel_job(&id)
}

#[tauri::command]
pub(crate) async fn scheduler_get_history(
    state: State<'_, Arc<Mutex<SchedulerManager>>>,
    job_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<JobRun>, String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    Ok(mgr.get_history(job_id.as_deref(), limit.unwrap_or(50)))
}
