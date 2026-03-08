use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: u64,
    pub source: String,
}

#[derive(Serialize, Deserialize)]
struct HistoryManifest {
    version: u32,
    resource: String,
    entries: Vec<HistoryEntry>,
}

fn hash_file_path(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn history_dir(app: &tauri::AppHandle, file_path: &str) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    let hash = hash_file_path(file_path);
    Ok(base.join("history").join(hash))
}

fn file_extension(file_path: &str) -> &str {
    Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read_manifest(dir: &Path, file_path: &str) -> HistoryManifest {
    let manifest_path = dir.join("entries.json");
    if manifest_path.exists() {
        if let Ok(data) = fs::read_to_string(&manifest_path) {
            if let Ok(m) = serde_json::from_str::<HistoryManifest>(&data) {
                return m;
            }
        }
    }
    HistoryManifest {
        version: 1,
        resource: file_path.to_string(),
        entries: Vec::new(),
    }
}

fn write_manifest(dir: &Path, manifest: &HistoryManifest) -> Result<(), String> {
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    fs::write(dir.join("entries.json"), json).map_err(|e| e.to_string())
}

fn cleanup_entries(dir: &Path, manifest: &mut HistoryManifest, max_entries: usize) {
    while manifest.entries.len() > max_entries {
        if let Some(removed) = manifest.entries.pop() {
            let ext = Path::new(&manifest.resource)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("txt");
            let _ = fs::remove_file(dir.join(format!("{}.{}", removed.id, ext)));
        }
    }
}

#[tauri::command]
pub(crate) fn add_history_entry(
    app: tauri::AppHandle,
    file_path: String,
    content: String,
    source: String,
    max_entries: usize,
    max_file_size_mb: u64,
) -> Result<(), String> {
    let content_bytes = content.len() as u64;
    let max_bytes = max_file_size_mb * 1024 * 1024;
    if content_bytes > max_bytes {
        return Ok(());
    }

    let dir = history_dir(&app, &file_path)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let ext = file_extension(&file_path);
    let content_file = dir.join(format!("{}.{}", id, ext));
    fs::write(&content_file, &content).map_err(|e| e.to_string())?;

    let mut manifest = read_manifest(&dir, &file_path);
    manifest.entries.insert(
        0,
        HistoryEntry {
            id,
            timestamp: now_millis(),
            source,
        },
    );

    cleanup_entries(&dir, &mut manifest, max_entries);
    write_manifest(&dir, &manifest)
}

#[tauri::command]
pub(crate) fn get_history_entries(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<Vec<HistoryEntry>, String> {
    let dir = history_dir(&app, &file_path)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let manifest = read_manifest(&dir, &file_path);
    Ok(manifest.entries)
}

#[tauri::command]
pub(crate) fn get_history_content(
    app: tauri::AppHandle,
    file_path: String,
    entry_id: String,
) -> Result<String, String> {
    let dir = history_dir(&app, &file_path)?;
    let ext = file_extension(&file_path);
    let content_file = dir.join(format!("{}.{}", entry_id, ext));
    fs::read_to_string(&content_file).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn delete_history_entry(
    app: tauri::AppHandle,
    file_path: String,
    entry_id: String,
) -> Result<(), String> {
    let dir = history_dir(&app, &file_path)?;
    if !dir.exists() {
        return Ok(());
    }

    let mut manifest = read_manifest(&dir, &file_path);
    manifest.entries.retain(|e| e.id != entry_id);

    let ext = file_extension(&file_path);
    let _ = fs::remove_file(dir.join(format!("{}.{}", entry_id, ext)));

    write_manifest(&dir, &manifest)
}

#[tauri::command]
pub(crate) fn restore_history_entry(
    app: tauri::AppHandle,
    file_path: String,
    entry_id: String,
    max_entries: usize,
    max_file_size_mb: u64,
) -> Result<String, String> {
    // Read current file content for backup
    if let Ok(current_content) = fs::read_to_string(&file_path) {
        let _ = add_history_entry(
            app.clone(),
            file_path.clone(),
            current_content,
            "restore-backup".to_string(),
            max_entries,
            max_file_size_mb,
        );
    }

    // Read history entry content
    let dir = history_dir(&app, &file_path)?;
    let ext = file_extension(&file_path);
    let content_file = dir.join(format!("{}.{}", entry_id, ext));
    let content = fs::read_to_string(&content_file).map_err(|e| e.to_string())?;

    // Write to original file
    fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    Ok(content)
}
