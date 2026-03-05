use agent_client_protocol as acp;
use acp::Agent as _;
use std::rc::Rc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use super::client::HelmClient;

/// Commands sent from Tauri command handlers to the ACP thread
pub(crate) enum ACPCommand {
    SendPrompt {
        text: String,
        resp: oneshot::Sender<Result<String, String>>,
    },
    Cancel,
    RespondPermission {
        tool_call_id: String,
        option_id: String,
    },
    SetConfigOption {
        config_id: String,
        value: String,
        resp: oneshot::Sender<Result<String, String>>,
    },
    Stop,
}

/// Manages the ACP agent process and communication channel
pub(crate) struct ACPManager {
    /// Channel to send commands to the ACP thread
    pub cmd_tx: Option<mpsc::Sender<ACPCommand>>,
}

impl ACPManager {
    pub fn new() -> Self {
        Self { cmd_tx: None }
    }

    /// Start an ACP agent process and initialize the connection
    pub fn start_agent(
        &mut self,
        app: AppHandle,
        agent_path: String,
        agent_args: Vec<String>,
        cwd: String,
        load_session_id: Option<String>,
    ) -> Result<(), String> {
        if self.cmd_tx.is_some() {
            return Err("Agent already running".to_string());
        }

        let (cmd_tx, cmd_rx) = mpsc::channel::<ACPCommand>(32);
        self.cmd_tx = Some(cmd_tx);

        // Spawn a dedicated thread with its own tokio runtime and LocalSet
        // because the ACP Client trait produces !Send futures
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for ACP");

            let local_set = tokio::task::LocalSet::new();
            local_set.block_on(&rt, async move {
                if let Err(e) = run_acp_session(app.clone(), agent_path, agent_args, cwd, cmd_rx, load_session_id).await {
                    eprintln!("[acp] session error: {}", e);
                    let _ = app.emit("acp-error", e);
                }
            });
        });

        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.try_send(ACPCommand::Stop);
        }
    }
}

async fn run_acp_session(
    app: AppHandle,
    agent_path: String,
    agent_args: Vec<String>,
    cwd: String,
    mut cmd_rx: mpsc::Receiver<ACPCommand>,
    load_session_id: Option<String>,
) -> Result<(), String> {
    // Resolve shell PATH (macOS apps don't inherit shell environment)
    let shell_path = resolve_shell_path();

    // Spawn the agent process
    let mut cmd = tokio::process::Command::new(&agent_path);
    cmd.args(&agent_args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit()) // Agent logs to stderr
        .kill_on_drop(true);

    if let Some(ref path) = shell_path {
        cmd.env("PATH", path);
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start agent '{}': {}", agent_path, e))?;

    let stdin = child.stdin.take()
        .ok_or("Failed to get agent stdin")?;
    let stdout = child.stdout.take()
        .ok_or("Failed to get agent stdout")?;

    let client = Rc::new(HelmClient::new(app.clone()));

    // Create the ACP connection (wrapped in Rc so prompt futures can share it)
    let (conn, handle_io) = acp::ClientSideConnection::new(
        Rc::clone(&client),
        stdin.compat_write(),
        stdout.compat(),
        |fut| { tokio::task::spawn_local(fut); },
    );
    let conn = Rc::new(conn);

    // Handle I/O in the background
    tokio::task::spawn_local(handle_io);

    // Initialize the connection with terminal-auth capability
    let mut client_meta = serde_json::Map::new();
    client_meta.insert("terminal-auth".to_string(), serde_json::Value::Bool(true));

    let caps = acp::ClientCapabilities::new()
        .fs(
            acp::FileSystemCapability::new()
                .read_text_file(true)
                .write_text_file(true)
        )
        .terminal(true)
        .meta(client_meta);

    let client_info = acp::Implementation::new("helm", env!("CARGO_PKG_VERSION"))
        .title("Helm");

    let init_request = acp::InitializeRequest::new(acp::ProtocolVersion::V1)
        .client_capabilities(caps)
        .client_info(client_info);

    let init_response = conn.initialize(init_request)
        .await
        .map_err(|e| format!("ACP initialize failed: {}", e))?;

    eprintln!("[acp] initialized with agent: {:?}", init_response.agent_info);
    let _ = app.emit("acp-connected", serde_json::to_value(&init_response.agent_info).unwrap_or_default());

    // Extract terminal-auth command from auth methods (if available)
    let terminal_auth_cmd = extract_terminal_auth(&init_response.auth_methods);
    if let Some(ref ta) = terminal_auth_cmd {
        eprintln!("[acp] terminal-auth available: {} {:?}", ta.command, ta.args);
    }

    // Create or load a session
    let cwd_path = std::path::PathBuf::from(&cwd);
    let (session_id, config_options) = if let Some(ref sid) = load_session_id {
        // Load an existing session
        eprintln!("[acp] loading session: {}", sid);
        let load_req = acp::LoadSessionRequest::new(sid.clone(), cwd_path);
        let load_response = conn.load_session(load_req)
            .await
            .map_err(|e| format!("ACP load_session failed: {}", e))?;
        eprintln!("[acp] session loaded: {}", sid);
        (acp::SessionId::from(sid.clone()), load_response.config_options)
    } else {
        // Try to create a new session; if auth is required, run terminal-auth login
        let session_response = match conn.new_session(acp::NewSessionRequest::new(cwd_path.clone())).await {
            Ok(resp) => resp,
            Err(e) => {
                let err_str = format!("{}", e);
                // Check if this is an auth error (AUTH_REQUIRED = -32000)
                if err_str.contains("uthenticat") || err_str.contains("-32000") || err_str.contains("auth") {
                    eprintln!("[acp] auth required, attempting terminal-auth login...");

                    if let Some(ref ta) = terminal_auth_cmd {
                        let _ = app.emit("acp-auth-started", ());
                        run_terminal_auth(ta, shell_path.as_deref()).await?;
                        let _ = app.emit("acp-auth-completed", ());

                        // Retry new_session after authentication
                        conn.new_session(acp::NewSessionRequest::new(cwd_path))
                            .await
                            .map_err(|e| format!("ACP new_session failed after auth: {}", e))?
                    } else {
                        return Err(format!(
                            "Authentication required but no terminal-auth method available. \
                             Please run `claude /login` in your terminal first. Original error: {}", e
                        ));
                    }
                } else {
                    return Err(format!("ACP new_session failed: {}", e));
                }
            }
        };
        let sid = session_response.session_id.clone();
        eprintln!("[acp] session created: {}", sid);
        (sid, session_response.config_options)
    };

    // Emit the agent's session ID to the frontend
    let _ = app.emit("acp-session-id", session_id.to_string());

    // Emit session config options if available
    if let Some(ref config_options) = config_options {
        let _ = app.emit("acp-config-options", serde_json::to_value(config_options).unwrap_or_default());
    }

    // Process commands from Tauri
    // NOTE: prompt() must run concurrently with the command loop so that
    // RespondPermission commands can be processed while a prompt is in progress.
    // Otherwise we get a deadlock: prompt waits for permission → permission
    // response waits for the command loop → loop is blocked on prompt.
    // Channel for prompt results from spawned tasks
    let (prompt_done_tx, mut prompt_done_rx) = mpsc::channel::<(
        Result<acp::PromptResponse, acp::Error>,
        oneshot::Sender<Result<String, String>>,
    )>(1);
    let mut prompt_in_flight = false;

    loop {
        tokio::select! {
            // Receive prompt completion from spawned task
            Some((prompt_result, resp)) = prompt_done_rx.recv() => {
                prompt_in_flight = false;
                match &prompt_result {
                    Ok(response) => {
                        eprintln!("[acp] prompt completed: {:?}", response.stop_reason);
                    }
                    Err(e) => {
                        eprintln!("[acp] prompt error: {}", e);
                    }
                }
                match prompt_result {
                    Ok(response) => {
                        let stop_reason = format!("{:?}", response.stop_reason);
                        let _ = resp.send(Ok(stop_reason));
                    }
                    Err(e) => {
                        let _ = resp.send(Err(format!("Prompt failed: {}", e)));
                    }
                }
            }

            // Process incoming commands
            cmd = cmd_rx.recv() => {
                let Some(cmd) = cmd else { break };
                match cmd {
                    ACPCommand::SendPrompt { text, resp } => {
                        if prompt_in_flight {
                            let _ = resp.send(Err("A prompt is already in progress".to_string()));
                            continue;
                        }
                        prompt_in_flight = true;
                        let preview: String = text.chars().take(100).collect();
                        eprintln!("[acp] sending prompt: {}", preview);
                        let prompt = vec![
                            acp::ContentBlock::Text(acp::TextContent::new(text))
                        ];
                        let prompt_request = acp::PromptRequest::new(session_id.clone(), prompt);

                        let conn_rc = Rc::clone(&conn);
                        let done_tx = prompt_done_tx.clone();
                        tokio::task::spawn_local(async move {
                            let result = conn_rc.prompt(prompt_request).await;
                            let _ = done_tx.send((result, resp)).await;
                        });
                    }

                    ACPCommand::Cancel => {
                        let _ = conn.cancel(acp::CancelNotification::new(session_id.clone())).await;
                    }

                    ACPCommand::RespondPermission { tool_call_id, option_id } => {
                        client.respond_permission(&tool_call_id, option_id)
                            .unwrap_or_else(|e| eprintln!("[acp] respond_permission error: {}", e));
                    }

                    ACPCommand::SetConfigOption { config_id, value, resp } => {
                        let req = acp::SetSessionConfigOptionRequest::new(
                            session_id.clone(),
                            config_id,
                            value,
                        );
                        match conn.set_session_config_option(req).await {
                            Ok(response) => {
                                // Emit updated config options to frontend
                                let _ = app.emit("acp-config-options", serde_json::to_value(&response.config_options).unwrap_or_default());
                                let json = serde_json::to_string(&response.config_options).unwrap_or_default();
                                let _ = resp.send(Ok(json));
                            }
                            Err(e) => { let _ = resp.send(Err(format!("set_config_option failed: {}", e))); }
                        }
                    }

                    ACPCommand::Stop => {
                        eprintln!("[acp] stopping agent");
                        break;
                    }
                }
            }
        }
    }

    // Clean up
    drop(conn);  // Rc — drops our reference
    let _ = child.kill().await;
    let _ = app.emit("acp-disconnected", ());
    eprintln!("[acp] session ended");

    Ok(())
}

/// Terminal-auth command info extracted from auth method _meta
struct TerminalAuthCommand {
    command: String,
    args: Vec<String>,
}

/// Extract terminal-auth command from auth methods' _meta
fn extract_terminal_auth(auth_methods: &[acp::AuthMethod]) -> Option<TerminalAuthCommand> {
    for method in auth_methods {
        if let Some(ref meta) = method.meta {
            if let Some(ta) = meta.get("terminal-auth") {
                let command = ta.get("command")?.as_str()?.to_string();
                let args = ta.get("args")
                    .and_then(|a| a.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                return Some(TerminalAuthCommand { command, args });
            }
        }
    }
    None
}

/// Run the terminal-auth login command (opens browser for OAuth)
async fn run_terminal_auth(ta: &TerminalAuthCommand, shell_path: Option<&str>) -> Result<(), String> {
    eprintln!("[acp] running terminal-auth: {} {:?}", ta.command, ta.args);

    let mut cmd = tokio::process::Command::new(&ta.command);
    cmd.args(&ta.args)
        .stdin(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    if let Some(path) = shell_path {
        cmd.env("PATH", path);
    }

    let status = cmd.spawn()
        .map_err(|e| format!("Failed to start auth command '{}': {}", ta.command, e))?
        .wait()
        .await
        .map_err(|e| format!("Auth command failed: {}", e))?;

    if status.success() {
        eprintln!("[acp] terminal-auth completed successfully");
        Ok(())
    } else {
        Err(format!("Auth command exited with status: {}", status))
    }
}

/// Resolve PATH from the user's login shell on macOS.
/// GUI apps don't inherit the shell environment, so tools like `node` aren't found.
fn resolve_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = std::process::Command::new(&shell)
        .args(["-l", "-c", "echo $PATH"])
        .output()
        .ok()?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
}
