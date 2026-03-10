use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn ral_icon_themes_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(home.join(".ral").join("icon-themes"))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn ensure_icon_themes(app: AppHandle) -> Result<(), String> {
    let target_base = ral_icon_themes_dir()?;

    let resource_dir = app
        .path()
        .resolve("icon-themes", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    if !resource_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&resource_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            let theme_name = entry.file_name();
            let target = target_base.join(&theme_name);
            if !target.exists() {
                copy_dir_recursive(&entry.path(), &target)?;
            }
        }
    }

    Ok(())
}

#[derive(Serialize)]
pub(crate) struct IconThemeInfo {
    id: String,
    label: String,
    path: String,
}

#[tauri::command]
pub(crate) fn list_icon_themes() -> Result<Vec<IconThemeInfo>, String> {
    let themes_dir = ral_icon_themes_dir()?;
    if !themes_dir.exists() {
        return Ok(vec![]);
    }

    let mut themes = Vec::new();
    for entry in fs::read_dir(&themes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dir_path = entry.path();
        if !dir_path.is_dir() {
            continue;
        }

        let pkg_path = dir_path.join("package.json");
        if !pkg_path.exists() {
            continue;
        }

        let pkg_str = fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
        let pkg: serde_json::Value =
            serde_json::from_str(&pkg_str).map_err(|e| e.to_string())?;

        let id = pkg["contributes"]["iconThemes"][0]["id"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let label = pkg["contributes"]["iconThemes"][0]["label"]
            .as_str()
            .unwrap_or(&id)
            .to_string();

        if !id.is_empty() {
            themes.push(IconThemeInfo {
                id,
                label,
                path: dir_path.to_string_lossy().to_string(),
            });
        }
    }

    Ok(themes)
}

#[tauri::command]
pub(crate) fn load_icon_theme(theme_id: String) -> Result<serde_json::Value, String> {
    let themes_dir = ral_icon_themes_dir()?;
    let theme_dir = themes_dir.join(&theme_id);

    let pkg_path = theme_dir.join("package.json");
    let pkg_str = fs::read_to_string(&pkg_path)
        .map_err(|e| format!("Failed to read package.json for theme '{}': {}", theme_id, e))?;
    let pkg: serde_json::Value =
        serde_json::from_str(&pkg_str).map_err(|e| e.to_string())?;

    let manifest_rel = pkg["contributes"]["iconThemes"][0]["path"]
        .as_str()
        .ok_or_else(|| format!("No iconThemes path in package.json for '{}'", theme_id))?;

    let manifest_path = theme_dir.join(manifest_rel)
        .canonicalize()
        .map_err(|e| format!("Failed to resolve manifest path for '{}': {}", theme_id, e))?;
    let manifest_str = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest for '{}': {}", theme_id, e))?;

    let mut manifest: serde_json::Value =
        serde_json::from_str(&manifest_str).map_err(|e| e.to_string())?;

    manifest["_themeDir"] = serde_json::Value::String(
        theme_dir.to_string_lossy().to_string(),
    );
    if let Some(parent) = manifest_path.parent() {
        manifest["_manifestDir"] = serde_json::Value::String(
            parent.to_string_lossy().to_string(),
        );
    }

    Ok(manifest)
}
