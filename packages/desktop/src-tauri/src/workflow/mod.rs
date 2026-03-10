pub(crate) mod types;
pub(crate) mod parser;
pub(crate) mod template;
pub(crate) mod engine;
pub(crate) mod steps;
pub(crate) mod scheduler;
pub(crate) mod db;

use std::sync::{Arc, Mutex};

use tauri::{AppHandle, State};

use self::db::WorkflowDb;
use self::engine::WorkflowEngine;
use self::types::{WorkflowDef, WorkflowRun, WorkflowSummary};

/// List all workflows in the project
#[tauri::command]
pub(crate) async fn workflow_list(
    db_state: State<'_, Arc<WorkflowDb>>,
    project_path: String,
) -> Result<Vec<WorkflowSummary>, String> {
    let workflows = parser::scan_workflows(&project_path)?;
    let db = db_state.inner();

    let mut summaries = Vec::new();
    for (id, def, file_path) in workflows {
        let last_run = db.get_last_run(&id).await.ok().flatten();
        let schedule_desc = def
            .trigger
            .schedule
            .as_ref()
            .map(|s| s.description());

        summaries.push(WorkflowSummary {
            id,
            name: def.name,
            enabled: def.enabled,
            file_path,
            schedule_description: schedule_desc,
            last_run_at: last_run.as_ref().map(|r| r.started_at.clone()),
            last_run_status: last_run.as_ref().map(|r| r.status.clone()),
        });
    }

    Ok(summaries)
}

/// Get a workflow definition by ID
#[tauri::command]
pub(crate) async fn workflow_get(
    project_path: String,
    workflow_id: String,
) -> Result<WorkflowDef, String> {
    let workflows = parser::scan_workflows(&project_path)?;
    workflows
        .into_iter()
        .find(|(id, _, _)| id == &workflow_id)
        .map(|(_, def, _)| def)
        .ok_or_else(|| format!("Workflow '{}' not found", workflow_id))
}

/// Run a workflow manually
#[tauri::command]
pub(crate) async fn workflow_run(
    engine_state: State<'_, Arc<Mutex<WorkflowEngine>>>,
    db_state: State<'_, Arc<WorkflowDb>>,
    app: AppHandle,
    project_path: String,
    workflow_id: String,
) -> Result<String, String> {
    let workflows = parser::scan_workflows(&project_path)?;
    let (_, workflow_def, _) = workflows
        .into_iter()
        .find(|(id, _, _)| id == &workflow_id)
        .ok_or_else(|| format!("Workflow '{}' not found", workflow_id))?;

    let run_id = uuid::Uuid::new_v4().to_string();
    let run_id_clone = run_id.clone();
    let workflow_id_clone = workflow_id.clone();
    let engine = engine_state.inner().clone();
    let db = db_state.inner().clone();
    let project = project_path.clone();

    tauri::async_runtime::spawn(async move {
        let result = engine::execute_workflow(
            &engine,
            &db,
            &app,
            &workflow_def,
            &workflow_id_clone,
            &run_id_clone,
            &project,
        )
        .await;

        if let Err(e) = result {
            eprintln!("[workflow] execution error: {}", e);
        }
    });

    Ok(run_id)
}

/// Cancel a running workflow
#[tauri::command]
pub(crate) async fn workflow_cancel(
    engine_state: State<'_, Arc<Mutex<WorkflowEngine>>>,
    run_id: String,
) -> Result<(), String> {
    let engine = engine_state.lock().map_err(|e| e.to_string())?;
    engine.cancel(&run_id)
}

/// Get execution history for a workflow
#[tauri::command]
pub(crate) async fn workflow_get_runs(
    db_state: State<'_, Arc<WorkflowDb>>,
    workflow_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<WorkflowRun>, String> {
    let db = db_state.inner();
    db.get_runs(workflow_id.as_deref(), limit.unwrap_or(20) as i64)
        .await
}

/// Toggle workflow enabled/disabled
#[tauri::command]
pub(crate) async fn workflow_toggle(
    project_path: String,
    workflow_id: String,
    enabled: bool,
) -> Result<(), String> {
    let workflows = parser::scan_workflows(&project_path)?;
    let (_, _, file_path) = workflows
        .into_iter()
        .find(|(id, _, _)| id == &workflow_id)
        .ok_or_else(|| format!("Workflow '{}' not found", workflow_id))?;

    // Read, modify enabled field, write back
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workflow file: {}", e))?;

    let mut doc: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse workflow YAML: {}", e))?;

    if let serde_yaml::Value::Mapping(ref mut map) = doc {
        map.insert(
            serde_yaml::Value::String("enabled".to_string()),
            serde_yaml::Value::Bool(enabled),
        );
    }

    let new_content = serde_yaml::to_string(&doc)
        .map_err(|e| format!("Failed to serialize workflow YAML: {}", e))?;

    std::fs::write(&file_path, new_content)
        .map_err(|e| format!("Failed to write workflow file: {}", e))?;

    Ok(())
}

/// Start the workflow scheduler for a project
#[tauri::command]
pub(crate) async fn workflow_start_scheduler(
    engine_state: State<'_, Arc<Mutex<WorkflowEngine>>>,
    db_state: State<'_, Arc<WorkflowDb>>,
    app: AppHandle,
    project_path: String,
) -> Result<(), String> {
    let engine = engine_state.inner().clone();
    let db = db_state.inner().clone();

    scheduler::start_workflow_scheduler(engine, db, app, project_path);

    Ok(())
}

/// Stop the workflow scheduler
#[tauri::command]
pub(crate) async fn workflow_stop_scheduler(
    engine_state: State<'_, Arc<Mutex<WorkflowEngine>>>,
) -> Result<(), String> {
    let mut engine = engine_state.lock().map_err(|e| e.to_string())?;
    engine.stop_scheduler();
    Ok(())
}
