use agent_client_protocol as acp;
use std::cell::RefCell;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use super::terminal::ACPTerminalManager;

/// Pending permission request waiting for UI response
struct PendingPermission {
    tx: oneshot::Sender<String>,
}

pub(crate) struct HelmClient {
    app: AppHandle,
    pending_permissions: RefCell<HashMap<String, PendingPermission>>,
    terminals: RefCell<ACPTerminalManager>,
}

impl HelmClient {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            pending_permissions: RefCell::new(HashMap::new()),
            terminals: RefCell::new(ACPTerminalManager::new()),
        }
    }

    /// Called from the Tauri command handler when user responds to a permission request
    pub fn respond_permission(&self, tool_call_id: &str, option_id: String) -> Result<(), String> {
        let mut pending = self.pending_permissions.borrow_mut();
        if let Some(p) = pending.remove(tool_call_id) {
            let _ = p.tx.send(option_id);
            Ok(())
        } else {
            Err(format!("No pending permission for {}", tool_call_id))
        }
    }
}

#[async_trait::async_trait(?Send)]
impl acp::Client for HelmClient {
    async fn session_notification(
        &self,
        args: acp::SessionNotification,
    ) -> acp::Result<()> {
        let payload = serde_json::to_value(&args).unwrap_or_default();
        let _ = self.app.emit("acp-update", payload);
        Ok(())
    }

    async fn request_permission(
        &self,
        args: acp::RequestPermissionRequest,
    ) -> acp::Result<acp::RequestPermissionResponse> {
        let tool_call_id = args.tool_call.tool_call_id.0.to_string();

        // Create oneshot channel for UI response
        let (tx, rx) = oneshot::channel();

        // Store pending request
        {
            let mut pending = self.pending_permissions.borrow_mut();
            pending.insert(tool_call_id.clone(), PendingPermission { tx });
        }

        // Emit permission request to frontend
        let payload = serde_json::to_value(&args).unwrap_or_default();
        let _ = self.app.emit("acp-permission", payload);

        // Wait for user response
        match rx.await {
            Ok(option_id) => Ok(acp::RequestPermissionResponse::new(
                acp::RequestPermissionOutcome::Selected(
                    acp::SelectedPermissionOutcome::new(option_id)
                ),
            )),
            Err(_) => Ok(acp::RequestPermissionResponse::new(
                acp::RequestPermissionOutcome::Cancelled,
            )),
        }
    }

    async fn read_text_file(
        &self,
        args: acp::ReadTextFileRequest,
    ) -> acp::Result<acp::ReadTextFileResponse> {
        let path = &args.path;
        let content = std::fs::read_to_string(path)
            .map_err(|e| acp::Error::new(-32603, format!("Failed to read {}: {}", path.display(), e)))?;

        // Handle line/limit parameters
        let result = match (args.line, args.limit) {
            (Some(start_line), Some(limit)) => {
                let start = (start_line as usize).saturating_sub(1);
                content.lines()
                    .skip(start)
                    .take(limit as usize)
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            (Some(start_line), None) => {
                let start = (start_line as usize).saturating_sub(1);
                content.lines()
                    .skip(start)
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            (None, Some(limit)) => {
                content.lines()
                    .take(limit as usize)
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            (None, None) => content,
        };

        Ok(acp::ReadTextFileResponse::new(result))
    }

    async fn write_text_file(
        &self,
        args: acp::WriteTextFileRequest,
    ) -> acp::Result<acp::WriteTextFileResponse> {
        let path = &args.path;

        // Create parent directories if needed
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        std::fs::write(path, &args.content)
            .map_err(|e| acp::Error::new(-32603, format!("Failed to write {}: {}", path.display(), e)))?;

        // Notify frontend about file change
        let _ = self.app.emit("file-changed", path.display().to_string());

        Ok(acp::WriteTextFileResponse::new())
    }

    async fn create_terminal(
        &self,
        args: acp::CreateTerminalRequest,
    ) -> acp::Result<acp::CreateTerminalResponse> {
        let env_vars: Vec<(String, String)> = args.env.iter()
            .map(|e| (e.name.clone(), e.value.clone()))
            .collect();

        let args_vec: Vec<String> = args.args.clone();
        let cwd = args.cwd.as_ref().and_then(|p| p.to_str());
        let output_limit = args.output_byte_limit.map(|l| l as usize);

        let terminal_id = self.terminals.borrow_mut()
            .create(&args.command, &args_vec, &env_vars, cwd, output_limit)
            .map_err(|e| acp::Error::new(-32603, e))?;

        Ok(acp::CreateTerminalResponse::new(terminal_id))
    }

    async fn terminal_output(
        &self,
        args: acp::TerminalOutputRequest,
    ) -> acp::Result<acp::TerminalOutputResponse> {
        let tid: &str = &args.terminal_id.0;
        let (output, truncated, exit_status) = self.terminals.borrow_mut()
            .get_output(tid)
            .map_err(|e| acp::Error::new(-32603, e))?;

        let exit = exit_status.map(|(code, signal)| {
            let mut status = acp::TerminalExitStatus::new();
            if let Some(c) = code {
                status = status.exit_code(c as u32);
            }
            if let Some(s) = signal {
                status = status.signal(s);
            }
            status
        });

        Ok(acp::TerminalOutputResponse::new(output, truncated).exit_status(exit))
    }

    async fn wait_for_terminal_exit(
        &self,
        args: acp::WaitForTerminalExitRequest,
    ) -> acp::Result<acp::WaitForTerminalExitResponse> {
        let tid: &str = &args.terminal_id.0;
        let (exit_code, signal) = self.terminals.borrow_mut()
            .wait_for_exit(tid)
            .await
            .map_err(|e| acp::Error::new(-32603, e))?;

        let mut status = acp::TerminalExitStatus::new();
        if let Some(c) = exit_code {
            status = status.exit_code(c as u32);
        }
        if let Some(s) = signal {
            status = status.signal(s);
        }

        Ok(acp::WaitForTerminalExitResponse::new(status))
    }

    async fn kill_terminal_command(
        &self,
        args: acp::KillTerminalCommandRequest,
    ) -> acp::Result<acp::KillTerminalCommandResponse> {
        let tid: &str = &args.terminal_id.0;
        self.terminals.borrow_mut()
            .kill(tid)
            .map_err(|e| acp::Error::new(-32603, e))?;

        Ok(acp::KillTerminalCommandResponse::new())
    }

    async fn release_terminal(
        &self,
        args: acp::ReleaseTerminalRequest,
    ) -> acp::Result<acp::ReleaseTerminalResponse> {
        let tid: &str = &args.terminal_id.0;
        self.terminals.borrow_mut()
            .release(tid)
            .map_err(|e| acp::Error::new(-32603, e))?;

        Ok(acp::ReleaseTerminalResponse::new())
    }

    async fn ext_method(
        &self,
        _args: acp::ExtRequest,
    ) -> acp::Result<acp::ExtResponse> {
        Err(acp::Error::method_not_found())
    }

    async fn ext_notification(
        &self,
        _args: acp::ExtNotification,
    ) -> acp::Result<()> {
        Ok(())
    }
}
