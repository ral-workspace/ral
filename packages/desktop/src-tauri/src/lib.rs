mod acp;
mod mcp;
mod context_menu;
mod document;
mod fs;
mod git;
mod history;
mod icon_themes;
mod lsp;
mod search;
mod terminal;
mod watcher;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(terminal::TerminalManager::new()))
        .manage(Mutex::new(watcher::FileWatcherState { debouncer: None }))
        .manage(Mutex::new(acp::ACPManager::new()))

        .manage(Mutex::new(mcp::McpState::new()))
        .manage(Mutex::new(lsp::LspManager::new()))
        .invoke_handler(tauri::generate_handler![
            fs::read_dir,
            fs::read_file,
            fs::write_file,
            fs::create_file,
            fs::append_file,
            fs::create_dir,
            fs::rename_path,
            fs::delete_path,
            fs::run_command,
            search::search_text,
            search::search_files,
            watcher::start_file_watcher,
            watcher::stop_file_watcher,
            terminal::spawn_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
            terminal::get_terminal_process_name,
            terminal::list_shells,
            icon_themes::ensure_icon_themes,
            icon_themes::list_icon_themes,
            icon_themes::load_icon_theme,
            acp::acp_start_agent,
            acp::acp_load_session,
            acp::acp_send_prompt,
            acp::acp_cancel,
            acp::acp_respond_permission,
            acp::acp_set_config_option,
            acp::acp_stop_agent,
            document::convert_to_pdf,
            context_menu::show_context_menu,
            mcp::mcp_connect,
            mcp::mcp_read_resource,
            git::git_diff_lines,
            history::add_history_entry,
            history::get_history_entries,
            history::get_history_content,
            history::delete_history_entry,
            history::restore_history_entry,
            lsp::lsp_start,
            lsp::lsp_send,
            lsp::lsp_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
