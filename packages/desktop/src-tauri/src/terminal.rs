use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
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

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

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
