mod acp;
mod fs;
mod icon_themes;
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
        .manage(Mutex::new(terminal::TerminalManager::new()))
        .manage(Mutex::new(watcher::FileWatcherState { debouncer: None }))
        .manage(Mutex::new(acp::ACPManager::new()))
        .invoke_handler(tauri::generate_handler![
            fs::read_dir,
            fs::read_file,
            fs::write_file,
            fs::create_file,
            fs::append_file,
            fs::create_dir,
            search::search_text,
            watcher::start_file_watcher,
            watcher::stop_file_watcher,
            terminal::spawn_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
            icon_themes::ensure_icon_themes,
            icon_themes::list_icon_themes,
            icon_themes::load_icon_theme,
            acp::acp_start_agent,
            acp::acp_send_prompt,
            acp::acp_cancel,
            acp::acp_respond_permission,
            acp::acp_set_config_option,
            acp::acp_stop_agent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
