use globset::{Glob, GlobSet, GlobSetBuilder};
use ignore::WalkBuilder;
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::BufRead;

#[derive(Serialize, Clone)]
pub(crate) struct SearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(serde::Deserialize)]
pub(crate) struct SearchOptions {
    pub case_insensitive: Option<bool>,
    pub is_regex: Option<bool>,
    pub whole_word: Option<bool>,
    pub max_results: Option<usize>,
    pub include_pattern: Option<String>,
    pub exclude_pattern: Option<String>,
}

fn build_glob_set(pattern: &str) -> Option<GlobSet> {
    if pattern.trim().is_empty() {
        return None;
    }
    let mut builder = GlobSetBuilder::new();
    for part in pattern.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        // If no path separator, treat as **/{pattern}
        let glob_pattern = if trimmed.contains('/') || trimmed.contains('\\') {
            trimmed.to_string()
        } else {
            format!("**/{trimmed}")
        };
        if let Ok(glob) = Glob::new(&glob_pattern) {
            builder.add(glob);
        }
    }
    builder.build().ok()
}

fn build_regex(query: &str, options: &SearchOptions) -> Result<Regex, String> {
    let is_regex = options.is_regex.unwrap_or(false);
    let whole_word = options.whole_word.unwrap_or(false);
    let case_insensitive = options.case_insensitive.unwrap_or(false);

    let pattern = if is_regex {
        query.to_string()
    } else {
        regex::escape(query)
    };

    let pattern = if whole_word {
        format!(r"\b{pattern}\b")
    } else {
        pattern
    };

    let pattern = if case_insensitive {
        format!("(?i){pattern}")
    } else {
        pattern
    };

    Regex::new(&pattern).map_err(|e| format!("Invalid regex: {e}"))
}

#[tauri::command]
pub(crate) fn search_text(
    root_path: String,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<SearchMatch>, String> {
    let options = options.unwrap_or(SearchOptions {
        case_insensitive: Some(false),
        is_regex: Some(false),
        whole_word: Some(false),
        max_results: Some(1000),
        include_pattern: None,
        exclude_pattern: None,
    });

    let max = options.max_results.unwrap_or(1000);
    let re = build_regex(&query, &options)?;

    let include_set = options
        .include_pattern
        .as_deref()
        .and_then(build_glob_set);
    let exclude_set = options
        .exclude_pattern
        .as_deref()
        .and_then(build_glob_set);

    let mut results = Vec::new();
    let walker = WalkBuilder::new(&root_path)
        .hidden(true)
        .git_ignore(true)
        .build();

    let root = std::path::Path::new(&root_path);

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
        let relative = path.strip_prefix(root).unwrap_or(path);

        // Apply include/exclude filters
        if let Some(ref inc) = include_set {
            if !inc.is_match(relative) {
                continue;
            }
        }
        if let Some(ref exc) = exclude_set {
            if exc.is_match(relative) {
                continue;
            }
        }

        // Skip binary files (check first 8KB)
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
                Err(_) => break, // likely binary
            };

            for mat in re.find_iter(&line) {
                if results.len() >= max {
                    break;
                }
                results.push(SearchMatch {
                    file_path: path.to_string_lossy().to_string(),
                    line_number: line_idx + 1,
                    line_content: line.clone(),
                    match_start: mat.start(),
                    match_end: mat.end(),
                });
            }
        }
    }

    Ok(results)
}

/// Fuzzy match score: returns Some(score) if query chars appear in order in target.
/// Higher score = better match. Bonuses for consecutive chars, word boundaries, filename matches.
fn fuzzy_score(query: &str, target: &str) -> Option<i64> {
    if query.is_empty() {
        return Some(0);
    }

    let query_chars: Vec<char> = query.chars().collect();
    let target_chars: Vec<char> = target.chars().collect();
    let target_lower: Vec<char> = target.to_lowercase().chars().collect();
    let query_lower: Vec<char> = query.to_lowercase().chars().collect();

    // Check if all query chars exist in order
    let mut qi = 0;
    for &tc in &target_lower {
        if qi < query_lower.len() && tc == query_lower[qi] {
            qi += 1;
        }
    }
    if qi < query_lower.len() {
        return None;
    }

    // Score the match
    let mut score: i64 = 0;
    let mut qi = 0;
    let mut prev_match = false;
    let mut consecutive = 0i64;

    // Bonus for matching in filename (after last '/')
    let filename_start = target.rfind('/').map(|i| i + 1).unwrap_or(0);

    for (ti, &tc) in target_lower.iter().enumerate() {
        if qi < query_lower.len() && tc == query_lower[qi] {
            // Base match score
            score += 1;

            // Consecutive match bonus
            if prev_match {
                consecutive += 1;
                score += consecutive.min(5) * 3;
            } else {
                consecutive = 0;
            }

            // Exact case match bonus
            if qi < query_chars.len() && target_chars[ti] == query_chars[qi] {
                score += 1;
            }

            // Word boundary bonus (start of word, after separator, camelCase)
            if ti == 0 || ti == filename_start {
                score += 10;
            } else if ti > 0 {
                let prev = target_chars[ti - 1];
                if prev == '/' || prev == '\\' || prev == '.' || prev == '-' || prev == '_' {
                    score += 5;
                } else if prev.is_lowercase() && target_chars[ti].is_uppercase() {
                    score += 3;
                }
            }

            // Filename match bonus (matching in the file name part is more valuable)
            if ti >= filename_start {
                score += 3;
            }

            prev_match = true;
            qi += 1;
        } else {
            prev_match = false;
            consecutive = 0;
        }
    }

    // Bonus for shorter paths (prefer less nested files)
    let depth = target.chars().filter(|&c| c == '/').count() as i64;
    score -= depth;

    // Bonus for shorter filenames
    let filename_len = target.len() - filename_start;
    if filename_len > 0 {
        score -= (filename_len as i64) / 10;
    }

    Some(score)
}

#[tauri::command]
pub(crate) fn search_files(
    root_path: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<String>, String> {
    let max = max_results.unwrap_or(512);

    let walker = WalkBuilder::new(&root_path)
        .hidden(true)
        .git_ignore(true)
        .build();

    let root = std::path::Path::new(&root_path);

    // Collect all matches with scores
    let mut scored: Vec<(String, i64)> = Vec::new();

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            continue;
        }

        let path = entry.path();
        let relative = path.strip_prefix(root).unwrap_or(path);
        let rel = relative.to_string_lossy();

        if query.is_empty() {
            scored.push((rel.to_string(), 0));
            if scored.len() >= max {
                break;
            }
        } else if let Some(score) = fuzzy_score(&query, &rel) {
            scored.push((rel.to_string(), score));
        }
    }

    // Sort by score descending
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    scored.truncate(max);

    Ok(scored.into_iter().map(|(path, _)| path).collect())
}
