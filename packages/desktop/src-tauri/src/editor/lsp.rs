use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};

pub(crate) struct LspManager {
    servers: HashMap<u32, LspServer>,
    next_id: u32,
}

struct LspServer {
    stdin: ChildStdin,
    child: Child,
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
            next_id: 1,
        }
    }
}

impl Drop for LspManager {
    fn drop(&mut self) {
        for (_, mut server) in self.servers.drain() {
            let _ = server.child.kill();
        }
    }
}

/// Parse LSP Content-Length header and read the full message body.
fn read_lsp_message(reader: &mut impl BufRead) -> Option<String> {
    let mut content_length: Option<usize> = None;

    // Read headers
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => return None, // EOF
            Ok(_) => {}
            Err(_) => return None,
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            break; // End of headers
        }

        if let Some(value) = trimmed.strip_prefix("Content-Length: ") {
            content_length = value.parse().ok();
        }
    }

    let len = content_length?;
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body).ok()?;
    String::from_utf8(body).ok()
}

/// Write an LSP message with Content-Length header.
fn write_lsp_message(stdin: &mut ChildStdin, message: &str) -> Result<(), String> {
    let header = format!("Content-Length: {}\r\n\r\n", message.len());
    stdin
        .write_all(header.as_bytes())
        .map_err(|e| e.to_string())?;
    stdin
        .write_all(message.as_bytes())
        .map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn lsp_start(
    app: AppHandle,
    state: tauri::State<'_, Mutex<LspManager>>,
    command: String,
    args: Vec<String>,
    root_path: Option<String>,
) -> Result<u32, String> {
    let mut child = Command::new(&command)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .current_dir(root_path.as_deref().unwrap_or("."))
        .spawn()
        .map_err(|e| format!("Failed to start LSP server '{}': {}", command, e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stdin = child.stdin.take().ok_or("No stdin")?;

    let mut manager = state.lock().map_err(|e| e.to_string())?;
    let id = manager.next_id;
    manager.next_id += 1;

    manager.servers.insert(
        id,
        LspServer {
            stdin,
            child,
        },
    );

    // Spawn reader thread for stdout → Tauri events
    let event_name = format!("lsp-message-{}", id);
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Some(message) = read_lsp_message(&mut reader) {
            if app.emit(&event_name, &message).is_err() {
                break;
            }
        }
    });

    Ok(id)
}

#[tauri::command]
pub(crate) fn lsp_send(
    state: tauri::State<'_, Mutex<LspManager>>,
    id: u32,
    message: String,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    let server = manager
        .servers
        .get_mut(&id)
        .ok_or("LSP server not found")?;
    write_lsp_message(&mut server.stdin, &message)
}

#[tauri::command]
pub(crate) fn lsp_stop(
    state: tauri::State<'_, Mutex<LspManager>>,
    id: u32,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    if let Some(mut server) = manager.servers.remove(&id) {
        let _ = server.child.kill();
    }
    Ok(())
}
