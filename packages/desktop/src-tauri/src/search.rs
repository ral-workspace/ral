use ignore::WalkBuilder;
use serde::Serialize;
use std::fs;
use std::io::BufRead;

#[derive(Serialize)]
pub(crate) struct SearchMatch {
    file_path: String,
    line_number: usize,
    line_content: String,
    match_start: usize,
    match_end: usize,
}

#[derive(serde::Deserialize)]
pub(crate) struct SearchOptions {
    case_insensitive: Option<bool>,
    max_results: Option<usize>,
}

#[tauri::command]
pub(crate) fn search_text(
    root_path: String,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<SearchMatch>, String> {
    let case_insensitive = options
        .as_ref()
        .and_then(|o| o.case_insensitive)
        .unwrap_or(false);
    let max = options
        .as_ref()
        .and_then(|o| o.max_results)
        .unwrap_or(1000);

    let query_normalized = if case_insensitive {
        query.to_lowercase()
    } else {
        query.clone()
    };

    let mut results = Vec::new();
    let walker = WalkBuilder::new(&root_path)
        .hidden(true)
        .git_ignore(true)
        .build();

    for entry in walker {
        if results.len() >= max {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            continue;
        }

        let path = entry.path();
        let file = match fs::File::open(path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let reader = std::io::BufReader::new(file);

        for (line_idx, line_result) in reader.lines().enumerate() {
            if results.len() >= max {
                break;
            }
            let line = match line_result {
                Ok(l) => l,
                Err(_) => break,
            };

            let haystack = if case_insensitive {
                line.to_lowercase()
            } else {
                line.clone()
            };

            if let Some(pos) = haystack.find(&query_normalized) {
                results.push(SearchMatch {
                    file_path: path.to_string_lossy().to_string(),
                    line_number: line_idx + 1,
                    line_content: line,
                    match_start: pos,
                    match_end: pos + query.len(),
                });
            }
        }
    }

    Ok(results)
}
