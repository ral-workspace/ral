use std::path::Path;

#[tauri::command]
pub fn convert_to_pdf(source_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("File not found: {source_path}"));
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "pdf" {
        return Ok(source_path);
    }

    Err(format!("Unsupported document format: .{ext}"))
}
