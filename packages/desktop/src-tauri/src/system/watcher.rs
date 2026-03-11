use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

struct WatcherEntry {
    debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
    ref_count: usize,
}

pub(crate) struct FileWatcherState {
    watchers: HashMap<String, WatcherEntry>,
}

impl FileWatcherState {
    pub(crate) fn new() -> Self {
        Self {
            watchers: HashMap::new(),
        }
    }
}

#[tauri::command]
pub(crate) fn start_file_watcher(
    app: AppHandle,
    state: State<'_, Mutex<FileWatcherState>>,
    path: String,
) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;

    // Increment ref count if already watching this path
    if let Some(entry) = watcher_state.watchers.get_mut(&path) {
        entry.ref_count += 1;
        return Ok(());
    }

    let app_handle = app.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(200), move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
        if let Ok(events) = events {
            for event in events {
                if event.kind == DebouncedEventKind::Any {
                    let path_str = event.path.to_string_lossy().to_string();
                    let _ = app_handle.emit("file-changed", path_str);
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(Path::new(&path), notify::RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    watcher_state.watchers.insert(path, WatcherEntry { debouncer, ref_count: 1 });
    Ok(())
}

#[tauri::command]
pub(crate) fn stop_file_watcher(
    state: State<'_, Mutex<FileWatcherState>>,
    path: String,
) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;
    if let Some(entry) = watcher_state.watchers.get_mut(&path) {
        entry.ref_count -= 1;
        if entry.ref_count == 0 {
            watcher_state.watchers.remove(&path);
        }
    }
    Ok(())
}
