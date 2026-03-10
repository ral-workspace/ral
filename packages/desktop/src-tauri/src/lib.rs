mod acp;
mod mcp;
mod context_menu;
mod document;
mod fs;
mod git;
mod history;
mod icon_themes;
mod lsp;
mod menu;
mod plugins;
mod scheduler;
mod search;
mod workflow;
mod terminal;
mod watcher;

use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Mutex::new(terminal::TerminalManager::new()))
        .manage(Mutex::new(watcher::FileWatcherState::new()))
        .manage(Mutex::new(acp::ACPManager::new()))
        .manage(Mutex::new(mcp::McpState::new()))
        .manage(Mutex::new(lsp::LspManager::new()))
        .manage(Arc::new(Mutex::new(scheduler::SchedulerManager::new())))
        .manage(Arc::new(Mutex::new(workflow::engine::WorkflowEngine::new())))
        .setup(|app| {
            let handle = app.handle().clone();
            let app_menu = menu::build_app_menu(&handle, &[], false)
                .expect("Failed to build app menu");
            app.set_menu(app_menu)?;

            app.on_menu_event(move |_app, event| {
                menu::handle_menu_event(&handle, &event);
            });

            // Start scheduler loop
            {
                let scheduler_state = app
                    .state::<Arc<Mutex<scheduler::SchedulerManager>>>()
                    .inner()
                    .clone();
                let scheduler_handle = app.handle().clone();
                scheduler::manager::start_scheduler_loop(
                    scheduler_state,
                    scheduler_handle,
                );
            }

            // Initialize workflow DB (async)
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match workflow::db::WorkflowDb::new().await {
                        Ok(db) => {
                            app_handle.manage(Arc::new(db));
                            eprintln!("[workflow] DB state registered");
                        }
                        Err(e) => {
                            eprintln!("[workflow] DB init failed: {}", e);
                        }
                    }
                });
            }

            // Ensure built-in plugins are installed (background, non-blocking)
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    plugins::ensure_builtin_plugins(app_handle).await;
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                if let Some(state) = window.try_state::<Mutex<acp::ACPManager>>() {
                    if let Ok(mut mgr) = state.inner().lock() {
                        mgr.stop(&label);
                    }
                }
            }
        })
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
            menu::update_recent_menu,
            scheduler::scheduler_list_jobs,
            scheduler::scheduler_create_job,
            scheduler::scheduler_update_job,
            scheduler::scheduler_delete_job,
            scheduler::scheduler_toggle_job,
            scheduler::scheduler_run_job_now,
            scheduler::scheduler_cancel_job,
            scheduler::scheduler_get_history,
            workflow::workflow_list,
            workflow::workflow_get,
            workflow::workflow_run,
            workflow::workflow_cancel,
            workflow::workflow_get_runs,
            workflow::workflow_toggle,
            workflow::workflow_start_scheduler,
            workflow::workflow_stop_scheduler,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
