mod client;
mod manager;
mod terminal;

use std::sync::Mutex;
use tauri::{AppHandle, State};
use tokio::sync::oneshot;

pub(crate) use manager::ACPManager;
use manager::ACPCommand;

#[tauri::command]
pub(crate) async fn acp_start_agent(
    app: AppHandle,
    state: State<'_, Mutex<ACPManager>>,
    agent_path: String,
    agent_args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.start_agent(app, agent_path, agent_args, cwd)
}

#[tauri::command]
pub(crate) async fn acp_send_prompt(
    state: State<'_, Mutex<ACPManager>>,
    text: String,
) -> Result<String, String> {
    let tx = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager.cmd_tx.clone().ok_or("Agent not running")?
    };

    let (resp_tx, resp_rx) = oneshot::channel();
    tx.send(ACPCommand::SendPrompt { text, resp: resp_tx })
        .await
        .map_err(|_| "Failed to send prompt to agent".to_string())?;

    resp_rx.await.map_err(|_| "Agent channel closed".to_string())?
}

#[tauri::command]
pub(crate) async fn acp_cancel(
    state: State<'_, Mutex<ACPManager>>,
) -> Result<(), String> {
    let tx = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager.cmd_tx.clone().ok_or("Agent not running")?
    };

    tx.send(ACPCommand::Cancel)
        .await
        .map_err(|_| "Failed to send cancel".to_string())
}

#[tauri::command]
pub(crate) async fn acp_respond_permission(
    state: State<'_, Mutex<ACPManager>>,
    tool_call_id: String,
    option_id: String,
) -> Result<(), String> {
    let tx = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager.cmd_tx.clone().ok_or("Agent not running")?
    };

    tx.send(ACPCommand::RespondPermission { tool_call_id, option_id })
        .await
        .map_err(|_| "Failed to send permission response".to_string())
}

#[tauri::command]
pub(crate) async fn acp_set_config_option(
    state: State<'_, Mutex<ACPManager>>,
    config_id: String,
    value: String,
) -> Result<String, String> {
    let tx = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager.cmd_tx.clone().ok_or("Agent not running")?
    };

    let (resp_tx, resp_rx) = oneshot::channel();
    tx.send(ACPCommand::SetConfigOption { config_id, value, resp: resp_tx })
        .await
        .map_err(|_| "Failed to send set_config_option".to_string())?;

    resp_rx.await.map_err(|_| "Agent channel closed".to_string())?
}

#[tauri::command]
pub(crate) async fn acp_stop_agent(
    state: State<'_, Mutex<ACPManager>>,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.stop();
    Ok(())
}
