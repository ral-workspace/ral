use std::path::Path;

use super::types::WorkflowDef;

/// Load a single workflow YAML file
pub fn load_workflow(path: &Path) -> Result<WorkflowDef, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read workflow file {:?}: {}", path, e))?;

    serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse workflow YAML {:?}: {}", path, e))
}

/// Scan all workflow YAML files in a project.
/// Returns (workflow_id, WorkflowDef, file_path) tuples.
/// workflow_id = filename without extension.
pub fn scan_workflows(project_path: &str) -> Result<Vec<(String, WorkflowDef, String)>, String> {
    let pattern = format!("{}/.helm/workflows/*.yaml", project_path);
    let mut results = Vec::new();

    let entries = glob::glob(&pattern)
        .map_err(|e| format!("Invalid glob pattern: {}", e))?;

    for entry in entries {
        let path = entry.map_err(|e| format!("Glob error: {}", e))?;

        let workflow_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if workflow_id.is_empty() {
            continue;
        }

        match load_workflow(&path) {
            Ok(def) => {
                let file_path = path.to_string_lossy().to_string();
                results.push((workflow_id, def, file_path));
            }
            Err(e) => {
                eprintln!("[workflow] skipping {:?}: {}", path, e);
            }
        }
    }

    Ok(results)
}
