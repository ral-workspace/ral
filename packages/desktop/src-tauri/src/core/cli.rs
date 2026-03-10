use std::path::PathBuf;

fn get_app_binary_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // In macOS .app bundle: ral.app/Contents/MacOS/ral
    // Return the actual binary path
    Ok(exe)
}

#[tauri::command]
pub fn install_cli() -> Result<String, String> {
    let bin_path = get_app_binary_path()?;
    let link_path = PathBuf::from("/usr/local/bin/ral");

    // Remove existing symlink if present
    if link_path.exists() || link_path.symlink_metadata().is_ok() {
        std::fs::remove_file(&link_path).map_err(|e| {
            format!(
                "Failed to remove existing /usr/local/bin/ral: {}. Try running with sudo.",
                e
            )
        })?;
    }

    // Create symlink
    #[cfg(unix)]
    std::os::unix::fs::symlink(&bin_path, &link_path).map_err(|e| {
        format!(
            "Failed to create symlink: {}. Try running: sudo ln -sf {} /usr/local/bin/ral",
            e,
            bin_path.display()
        )
    })?;

    #[cfg(not(unix))]
    return Err("CLI installation is only supported on macOS and Linux".to_string());

    Ok(format!(
        "Created symlink /usr/local/bin/ral -> {}",
        bin_path.display()
    ))
}

#[tauri::command]
pub fn uninstall_cli() -> Result<String, String> {
    let link_path = PathBuf::from("/usr/local/bin/ral");
    if link_path.exists() || link_path.symlink_metadata().is_ok() {
        std::fs::remove_file(&link_path)
            .map_err(|e| format!("Failed to remove /usr/local/bin/ral: {}", e))?;
        Ok("Removed /usr/local/bin/ral".to_string())
    } else {
        Ok("/usr/local/bin/ral does not exist".to_string())
    }
}
