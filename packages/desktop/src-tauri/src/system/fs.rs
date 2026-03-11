use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Reject paths containing `..` traversal components.
fn reject_traversal(path: &Path) -> Result<(), String> {
    for component in path.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Path traversal (..) is not allowed".to_string());
        }
    }
    Ok(())
}

/// Resolve a user-supplied path to an absolute canonical form.
/// For paths that must already exist (read, write, delete, read_dir).
fn sanitize_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    reject_traversal(p)?;
    p.canonicalize().map_err(|e| format!("Invalid path '{}': {}", path, e))
}

/// Validate a path for a new file/directory that doesn't exist yet.
/// Canonicalizes the parent directory and appends the file name.
fn sanitize_new_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    reject_traversal(p)?;
    let file_name = p.file_name()
        .ok_or_else(|| format!("Invalid path '{}': no file name", path))?;
    let parent = p.parent()
        .ok_or_else(|| format!("Invalid path '{}': no parent directory", path))?;
    // Parent may not exist yet for nested creation, so normalize without canonicalize
    // But ensure it doesn't contain traversal (already checked above)
    Ok(parent.join(file_name))
}

#[derive(Serialize)]
pub(crate) struct DirEntry {
    name: String,
    path: String,
    is_directory: bool,
}

#[tauri::command]
pub(crate) fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = sanitize_path(&path)?;
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<DirEntry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            Some(DirEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                is_directory: metadata.is_dir(),
            })
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub(crate) fn read_file(path: String) -> Result<String, String> {
    let p = sanitize_path(&path)?;
    fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn write_file(path: String, content: String) -> Result<(), String> {
    let p = sanitize_path(&path)?;
    fs::write(&p, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_file(path: String) -> Result<(), String> {
    let p = sanitize_new_path(&path)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::File::create(&p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn append_file(path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    let p = sanitize_new_path(&path)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&p)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn create_dir(path: String) -> Result<(), String> {
    let p = sanitize_new_path(&path)?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn rename_path(from: String, to: String) -> Result<(), String> {
    let src = sanitize_path(&from)?;
    let dest = sanitize_new_path(&to)?;
    fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn delete_path(path: String) -> Result<(), String> {
    let p = sanitize_path(&path)?;
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())
    }
}
