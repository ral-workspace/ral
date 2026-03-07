use git2::{DiffOptions, Repository};
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub(crate) struct DiffLine {
    /// 1-indexed line number in the current file
    pub line: usize,
    /// "added", "modified", or "deleted"
    pub kind: String,
}

/// Returns per-line diff indicators for a file compared to HEAD.
#[tauri::command]
pub(crate) fn git_diff_lines(file_path: String) -> Result<Vec<DiffLine>, String> {
    let repo = Repository::discover(&file_path).map_err(|e| e.message().to_string())?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "bare repository".to_string())?;

    let rel_path = std::path::Path::new(&file_path)
        .strip_prefix(workdir)
        .map_err(|_| "file not in repository".to_string())?;

    // Get HEAD tree
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(vec![]), // No commits yet
    };
    let head_tree = head
        .peel_to_tree()
        .map_err(|e| e.message().to_string())?;

    let mut opts = DiffOptions::new();
    opts.pathspec(rel_path.to_string_lossy().as_ref());
    opts.context_lines(0);

    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let mut results = Vec::new();

    diff.foreach(
        &mut |_, _| true,
        None,
        Some(&mut |_delta, hunk| {
            let _old_start = hunk.old_start() as usize;
            let old_lines = hunk.old_lines() as usize;
            let new_start = hunk.new_start() as usize;
            let new_lines = hunk.new_lines() as usize;

            if old_lines == 0 && new_lines > 0 {
                // Pure addition
                for i in 0..new_lines {
                    results.push(DiffLine {
                        line: new_start + i,
                        kind: "added".to_string(),
                    });
                }
            } else if new_lines == 0 && old_lines > 0 {
                // Pure deletion — mark the line after the deletion point
                results.push(DiffLine {
                    line: if new_start > 0 { new_start } else { 1 },
                    kind: "deleted".to_string(),
                });
            } else {
                // Modification
                for i in 0..new_lines {
                    results.push(DiffLine {
                        line: new_start + i,
                        kind: "modified".to_string(),
                    });
                }
            }
            true
        }),
        None,
    )
    .map_err(|e| e.message().to_string())?;

    Ok(results)
}
