use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct TerminalInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub(crate) struct TerminalManager {
    terminals: HashMap<u32, TerminalInstance>,
    next_id: u32,
}

impl TerminalManager {
    pub(crate) fn new() -> Self {
        Self {
            terminals: HashMap::new(),
            next_id: 1,
        }
    }
}

#[tauri::command]
pub(crate) fn spawn_terminal(
    app: AppHandle,
    state: State<'_, Mutex<TerminalManager>>,
    cwd: Option<String>,
    shell: Option<String>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = shell
        .or_else(|| std::env::var("SHELL").ok())
        .unwrap_or_else(|| "/bin/zsh".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    if let Some(ref dir) = cwd {
        cmd.cwd(dir);
    }

    eprintln!("[terminal] spawning shell: {}", shell);
    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        eprintln!("[terminal] spawn_command failed: {}", e);
        e.to_string()
    })?;
    eprintln!("[terminal] child spawned, dropping slave");
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let mut manager = state.lock().map_err(|e| e.to_string())?;
    let id = manager.next_id;
    manager.next_id += 1;

    manager.terminals.insert(
        id,
        TerminalInstance {
            master: pair.master,
            writer,
            child,
        },
    );
    drop(manager);

    eprintln!(
        "[terminal] terminal id={} created, starting reader thread",
        id
    );
    let event_name = format!("terminal-output-{}", id);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut pending = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);

                    let valid_up_to = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) => e.valid_up_to(),
                    };

                    if valid_up_to > 0 {
                        let data =
                            String::from_utf8(pending[..valid_up_to].to_vec()).unwrap();
                        let _ = app.emit(&event_name, data);
                        pending.drain(..valid_up_to);
                    }
                }
                Err(_) => break,
            }
        }
    });

    eprintln!("[terminal] spawn_terminal returning id={}", id);
    Ok(id)
}

#[tauri::command]
pub(crate) fn write_terminal(
    state: State<'_, Mutex<TerminalManager>>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    let terminal = manager
        .terminals
        .get_mut(&id)
        .ok_or_else(|| format!("Terminal {} not found", id))?;

    terminal
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) fn resize_terminal(
    state: State<'_, Mutex<TerminalManager>>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    let terminal = manager
        .terminals
        .get(&id)
        .ok_or_else(|| format!("Terminal {} not found", id))?;

    terminal
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) fn kill_terminal(state: State<'_, Mutex<TerminalManager>>, id: u32) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    if let Some(mut terminal) = manager.terminals.remove(&id) {
        let _ = terminal.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_terminal_process_name(
    state: State<'_, Mutex<TerminalManager>>,
    id: u32,
) -> Result<String, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    let terminal = manager
        .terminals
        .get(&id)
        .ok_or_else(|| format!("Terminal {} not found", id))?;

    let shell_pid = terminal
        .child
        .process_id()
        .ok_or_else(|| "No process ID".to_string())?;

    Ok(foreground_process_name(shell_pid))
}

/// Get the foreground process name for a shell PID.
/// Looks for child processes first; falls back to the shell itself.
fn foreground_process_name(shell_pid: u32) -> String {
    // Try to find a child (foreground) process
    if let Ok(output) = std::process::Command::new("pgrep")
        .args(["-P", &shell_pid.to_string()])
        .output()
    {
        if let Ok(stdout) = std::str::from_utf8(&output.stdout) {
            let trimmed = stdout.trim();
            if let Some(last_line) = trimmed.lines().last() {
                if let Ok(child_pid) = last_line.parse::<u32>() {
                    if let Some(name) = process_name(child_pid) {
                        return name;
                    }
                }
            }
        }
    }

    // Fall back to shell process name
    process_name(shell_pid).unwrap_or_else(|| "terminal".to_string())
}

#[derive(Serialize, Clone)]
pub(crate) struct ShellProfile {
    pub name: String,
    pub path: String,
    pub is_default: bool,
}

#[tauri::command]
pub(crate) fn list_shells() -> Result<Vec<ShellProfile>, String> {
    let default_shell = std::env::var("SHELL").unwrap_or_default();

    let contents = std::fs::read_to_string("/etc/shells").map_err(|e| e.to_string())?;
    let mut profiles: Vec<ShellProfile> = contents
        .lines()
        .map(|line| {
            let idx = line.find('#');
            if let Some(i) = idx {
                &line[..i]
            } else {
                line
            }
        })
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .filter(|s| std::path::Path::new(s).exists())
        .map(|path| {
            let name = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("terminal")
                .to_string();
            let is_default = path == default_shell;
            ShellProfile {
                name,
                path: path.to_string(),
                is_default,
            }
        })
        .collect();

    // Deduplicate by name (keep first occurrence, like VS Code)
    let mut seen = std::collections::HashSet::new();
    profiles.retain(|p| seen.insert(p.name.clone()));

    Ok(profiles)
}

fn process_name(pid: u32) -> Option<String> {
    let output = std::process::Command::new("ps")
        .args(["-o", "comm=", "-p", &pid.to_string()])
        .output()
        .ok()?;
    let name = std::str::from_utf8(&output.stdout).ok()?.trim();
    let basename = name.rsplit('/').next().unwrap_or(name);
    if basename.is_empty() {
        None
    } else {
        Some(basename.to_string())
    }
}
