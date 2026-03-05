use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::{AppHandle, Manager, State};

pub struct ConversionCache {
    /// Maps source path → (mtime_secs, cached_pdf_path)
    entries: HashMap<String, (u64, PathBuf)>,
}

impl ConversionCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }
}

fn get_mtime(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Failed to read file metadata: {e}"))?;
    let mtime = meta
        .modified()
        .map_err(|e| format!("Failed to get modification time: {e}"))?;
    Ok(mtime
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs())
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to resolve app cache dir: {e}"))?;
    let dir = base.join("converted");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create cache dir: {e}"))?;
    }
    Ok(dir)
}

fn hash_path(source: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[tauri::command]
pub fn convert_to_pdf(
    app: AppHandle,
    source_path: String,
    cache: State<'_, Mutex<ConversionCache>>,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("File not found: {source_path}"));
    }

    let mtime = get_mtime(source)?;

    // Check cache
    {
        let cache_guard = cache.lock().map_err(|e| format!("Cache lock error: {e}"))?;
        if let Some((cached_mtime, cached_path)) = cache_guard.entries.get(&source_path) {
            if *cached_mtime == mtime && cached_path.exists() {
                return Ok(cached_path.to_string_lossy().to_string());
            }
        }
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // PDF files don't need conversion
    if ext == "pdf" {
        return Ok(source_path);
    }

    let out_dir = cache_dir(&app)?;
    let out_name = format!("{}.pdf", hash_path(&source_path));
    let out_path = out_dir.join(&out_name);

    // Find LibreOffice
    let lo_path = find_libreoffice().ok_or_else(|| {
        "LibreOffice not found. Install LibreOffice to preview PowerPoint files.\n\
         macOS: brew install --cask libreoffice\n\
         https://www.libreoffice.org/download/"
            .to_string()
    })?;

    let output = Command::new(&lo_path)
        .args([
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            out_dir.to_str().unwrap_or(""),
            &source_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run LibreOffice: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("LibreOffice conversion failed: {stderr}"));
    }

    // LibreOffice outputs with the original filename but .pdf extension
    let original_name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let lo_output = out_dir.join(format!("{original_name}.pdf"));

    // Rename to our hashed name if different
    if lo_output != out_path {
        if out_path.exists() {
            fs::remove_file(&out_path).ok();
        }
        fs::rename(&lo_output, &out_path)
            .map_err(|e| format!("Failed to rename converted file: {e}"))?;
    }

    // Update cache
    {
        let mut cache_guard = cache.lock().map_err(|e| format!("Cache lock error: {e}"))?;
        cache_guard
            .entries
            .insert(source_path, (mtime, out_path.clone()));
    }

    Ok(out_path.to_string_lossy().to_string())
}

fn find_libreoffice() -> Option<String> {
    // macOS
    let mac_path = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
    if Path::new(mac_path).exists() {
        return Some(mac_path.to_string());
    }

    // Check PATH
    if Command::new("soffice")
        .arg("--version")
        .output()
        .is_ok()
    {
        return Some("soffice".to_string());
    }

    // Linux common paths
    for path in &["/usr/bin/soffice", "/usr/local/bin/soffice"] {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    None
}
