mod acp;
mod core;
mod editor;
mod mcp;
mod scheduler;
mod system;
mod workflow;

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
        .manage(Mutex::new(system::terminal::TerminalManager::new()))
        .manage(Mutex::new(system::watcher::FileWatcherState::new()))
        .manage(Mutex::new(acp::ACPManager::new()))
        .manage(Mutex::new(mcp::McpState::new()))
        .manage(Mutex::new(editor::lsp::LspManager::new()))
        .manage(Arc::new(Mutex::new(scheduler::SchedulerManager::new())))
        .manage(Arc::new(Mutex::new(workflow::engine::WorkflowEngine::new())))
        .setup(|app| {
            let handle = app.handle().clone();
            let app_menu = core::menu::build_app_menu(&handle, &[], false)
                .expect("Failed to build app menu");
            app.set_menu(app_menu)?;

            app.on_menu_event(move |_app, event| {
                core::menu::handle_menu_event(&handle, &event);
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
                    core::plugins::ensure_builtin_plugins(app_handle).await;
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
            system::fs::read_dir,
            system::fs::read_file,
            system::fs::write_file,
            system::fs::create_file,
            system::fs::append_file,
            system::fs::create_dir,
            system::fs::rename_path,
            system::fs::delete_path,
            system::fs::run_command,
            system::search::search_text,
            system::search::search_files,
            system::watcher::start_file_watcher,
            system::watcher::stop_file_watcher,
            system::terminal::spawn_terminal,
            system::terminal::write_terminal,
            system::terminal::resize_terminal,
            system::terminal::kill_terminal,
            system::terminal::get_terminal_process_name,
            system::terminal::list_shells,
            core::icon_themes::ensure_icon_themes,
            core::icon_themes::list_icon_themes,
            core::icon_themes::load_icon_theme,
            acp::acp_start_agent,
            acp::acp_load_session,
            acp::acp_send_prompt,
            acp::acp_cancel,
            acp::acp_respond_permission,
            acp::acp_set_config_option,
            acp::acp_stop_agent,
            editor::document::convert_to_pdf,
            core::context_menu::show_context_menu,
            mcp::mcp_connect,
            mcp::mcp_read_resource,
            editor::git::git_diff_lines,
            editor::history::add_history_entry,
            editor::history::get_history_entries,
            editor::history::get_history_content,
            editor::history::delete_history_entry,
            editor::history::restore_history_entry,
            editor::lsp::lsp_start,
            editor::lsp::lsp_send,
            editor::lsp::lsp_stop,
            core::menu::update_recent_menu,
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
