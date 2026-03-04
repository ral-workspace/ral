use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub(crate) struct FileWatcherState {
    #[allow(dead_code)]
    pub(crate) debouncer: Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>,
}

#[tauri::command]
pub(crate) fn start_file_watcher(
    app: AppHandle,
    state: State<'_, Mutex<FileWatcherState>>,
    path: String,
) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;

    // Stop existing watcher
    watcher_state.debouncer = None;

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

    watcher_state.debouncer = Some(debouncer);
    Ok(())
}

#[tauri::command]
pub(crate) fn stop_file_watcher(state: State<'_, Mutex<FileWatcherState>>) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;
    watcher_state.debouncer = None;
    Ok(())
}
