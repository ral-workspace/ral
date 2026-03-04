use std::cell::RefCell;
use std::collections::HashMap;
use std::process::Stdio;
use std::rc::Rc;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
struct TerminalState {
    output: Vec<u8>,
    output_byte_limit: Option<usize>,
    truncated: bool,
    exit_code: Option<i32>,
    exit_signal: Option<String>,
    exited: bool,
}

pub(crate) struct ACPTerminal {
    state: Rc<RefCell<TerminalState>>,
    child: Option<Child>,
}

pub(crate) struct ACPTerminalManager {
    terminals: HashMap<String, ACPTerminal>,
    next_id: u32,
}

impl ACPTerminalManager {
    pub fn new() -> Self {
        Self {
            terminals: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn create(
        &mut self,
        command: &str,
        args: &[String],
        env: &[(String, String)],
        cwd: Option<&str>,
        output_byte_limit: Option<usize>,
    ) -> Result<String, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (name, value) in env {
            cmd.env(name, value);
        }

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

        let id = format!("acp_term_{}", self.next_id);
        self.next_id += 1;

        let state = Rc::new(RefCell::new(TerminalState {
            output: Vec::new(),
            output_byte_limit,
            truncated: false,
            exit_code: None,
            exit_signal: None,
            exited: false,
        }));

        // Spawn background tasks to read stdout and stderr
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        if let Some(stdout) = stdout {
            let state_ref = Rc::clone(&state);
            tokio::task::spawn_local(read_into_buffer(stdout, state_ref));
        }

        if let Some(stderr) = stderr {
            let state_ref = Rc::clone(&state);
            tokio::task::spawn_local(read_into_buffer(stderr, state_ref));
        }

        // Store the terminal — exit detection is done in get_output/wait_for_exit
        self.terminals.insert(id.clone(), ACPTerminal {
            state,
            child: Some(child),
        });

        Ok(id)
    }

    pub fn get_output(
        &mut self,
        terminal_id: &str,
    ) -> Result<(String, bool, Option<(Option<i32>, Option<String>)>), String> {
        let terminal = self.terminals.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        // Try to detect exit
        if !terminal.state.borrow().exited {
            if let Some(ref mut child) = terminal.child {
                if let Ok(Some(status)) = child.try_wait() {
                    let mut state = terminal.state.borrow_mut();
                    state.exit_code = status.code();
                    state.exited = true;
                }
            }
        }

        let state = terminal.state.borrow();
        let output = String::from_utf8_lossy(&state.output).to_string();
        let exit_status = if state.exited {
            Some((state.exit_code, state.exit_signal.clone()))
        } else {
            None
        };

        Ok((output, state.truncated, exit_status))
    }

    pub async fn wait_for_exit(
        &mut self,
        terminal_id: &str,
    ) -> Result<(Option<i32>, Option<String>), String> {
        let terminal = self.terminals.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        {
            let state = terminal.state.borrow();
            if state.exited {
                return Ok((state.exit_code, state.exit_signal.clone()));
            }
        }

        if let Some(ref mut child) = terminal.child {
            let status = child.wait().await.map_err(|e| e.to_string())?;
            let mut state = terminal.state.borrow_mut();
            state.exit_code = status.code();
            state.exited = true;
            Ok((state.exit_code, state.exit_signal.clone()))
        } else {
            Err("No child process".to_string())
        }
    }

    pub fn kill(&mut self, terminal_id: &str) -> Result<(), String> {
        let terminal = self.terminals.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        if let Some(ref mut child) = terminal.child {
            let _ = child.start_kill();
        }
        Ok(())
    }

    pub fn release(&mut self, terminal_id: &str) -> Result<(), String> {
        if let Some(mut terminal) = self.terminals.remove(terminal_id) {
            if let Some(ref mut child) = terminal.child {
                let _ = child.start_kill();
            }
        }
        Ok(())
    }
}

async fn read_into_buffer<R: AsyncReadExt + Unpin>(mut reader: R, state: Rc<RefCell<TerminalState>>) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let mut s = state.borrow_mut();
                s.output.extend_from_slice(&buf[..n]);

                // Apply byte limit with truncation from the beginning
                if let Some(limit) = s.output_byte_limit {
                    if s.output.len() > limit {
                        let excess = s.output.len() - limit;
                        // Find a valid UTF-8 boundary
                        let drain_to = {
                            let mut pos = excess;
                            while pos < s.output.len() && (s.output[pos] & 0xC0) == 0x80 {
                                pos += 1;
                            }
                            pos
                        };
                        s.output.drain(..drain_to);
                        s.truncated = true;
                    }
                }
            }
            Err(_) => break,
        }
    }
}
