use tauri::menu::{CheckMenuItem, Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder, Wry};

/// Create a new window and return its handle.
pub fn create_new_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let label = format!(
        "window-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let builder = WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App(Default::default()))
        .title("")
        .inner_size(1200.0, 800.0)
        .visible(false)
        .decorations(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay);

    builder
        .build()
        .map_err(|e| format!("Failed to create new window: {}", e))
}

/// Emit an event only to the currently focused window.
/// If no window is focused, do nothing (avoid triggering all windows).
fn emit_to_focused(app: &AppHandle, event: &str, payload: impl serde::Serialize + Clone) {
    for window in app.webview_windows().values() {
        if window.is_focused().unwrap_or(false) {
            let _ = window.emit(event, payload);
            return;
        }
    }
}

pub fn build_app_menu(app: &AppHandle, recent_paths: &[String], auto_save: bool) -> Result<Menu<Wry>, tauri::Error> {
    let menu = Menu::new(app)?;

    // macOS: App menu (Ral)
    #[cfg(target_os = "macos")]
    {
        let about_metadata = tauri::menu::AboutMetadataBuilder::new()
            .name(Some("Ral"))
            .version(Some(env!("CARGO_PKG_VERSION")))
            .build();
        let about = PredefinedMenuItem::about(app, Some("About Ral"), Some(about_metadata))?;
        let sep1 = PredefinedMenuItem::separator(app)?;
        let services = PredefinedMenuItem::services(app, None)?;
        let sep2 = PredefinedMenuItem::separator(app)?;
        let hide = PredefinedMenuItem::hide(app, None)?;
        let hide_others = PredefinedMenuItem::hide_others(app, None)?;
        let show_all = PredefinedMenuItem::show_all(app, None)?;
        let sep3 = PredefinedMenuItem::separator(app)?;
        let quit = PredefinedMenuItem::quit(app, None)?;
        let app_menu = Submenu::with_items(
            app, "Ral", true,
            &[&about, &sep1, &services, &sep2, &hide, &hide_others, &show_all, &sep3, &quit],
        )?;
        menu.append(&app_menu)?;
    }

    // File menu
    let new_file = MenuItemBuilder::with_id("menu_new_file", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_window = MenuItemBuilder::with_id("menu_new_window", "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let file_sep1 = PredefinedMenuItem::separator(app)?;
    let open_folder = MenuItemBuilder::with_id("menu_open_folder", "Open Folder...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    // Open Recent submenu
    let mut open_recent_items: Vec<tauri::menu::MenuItem<Wry>> = Vec::new();
    for (i, path) in recent_paths.iter().enumerate() {
        let label = path.split('/').last().unwrap_or(path);
        let item = MenuItemBuilder::with_id(format!("recent_{}", i), label)
            .build(app)?;
        open_recent_items.push(item);
    }

    let file_sep2 = PredefinedMenuItem::separator(app)?;
    let save = MenuItemBuilder::with_id("menu_save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("menu_save_as", "Save As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let save_all = MenuItemBuilder::with_id("menu_save_all", "Save All")
        .accelerator("CmdOrCtrl+Alt+S")
        .build(app)?;
    let file_sep3 = PredefinedMenuItem::separator(app)?;
    let auto_save_item = CheckMenuItem::with_id(app, "menu_auto_save", "Auto Save", true, auto_save, None::<&str>)?;
    let file_sep4 = PredefinedMenuItem::separator(app)?;
    let revert_file = MenuItemBuilder::with_id("menu_revert_file", "Revert File")
        .build(app)?;
    let close_editor = MenuItemBuilder::with_id("menu_close_editor", "Close Editor")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let close_folder = MenuItemBuilder::with_id("menu_close_folder", "Close Folder")
        .build(app)?;
    let close_window = PredefinedMenuItem::close_window(app, Some("Close Window"))?;

    if recent_paths.is_empty() {
        let file_menu = Submenu::with_items(
            app, "File", true,
            &[
                &new_file, &new_window,
                &file_sep1,
                &open_folder,
                &file_sep2,
                &save, &save_as, &save_all,
                &file_sep3,
                &auto_save_item,
                &file_sep4,
                &revert_file, &close_editor, &close_folder, &close_window,
            ],
        )?;
        menu.append(&file_menu)?;
    } else {
        let recent_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> =
            open_recent_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<Wry>).collect();
        let open_recent = Submenu::with_items(app, "Open Recent", true, &recent_refs)?;
        let file_menu = Submenu::with_items(
            app, "File", true,
            &[
                &new_file, &new_window,
                &file_sep1,
                &open_folder, &open_recent,
                &file_sep2,
                &save, &save_as, &save_all,
                &file_sep3,
                &auto_save_item,
                &file_sep4,
                &revert_file, &close_editor, &close_folder, &close_window,
            ],
        )?;
        menu.append(&file_menu)?;
    }

    // Edit menu (all PredefinedMenuItem for system shortcuts)
    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let edit_sep = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let edit_menu = Submenu::with_items(
        app, "Edit", true,
        &[&undo, &redo, &edit_sep, &cut, &copy, &paste, &select_all],
    )?;
    menu.append(&edit_menu)?;

    // View menu
    let command_palette = MenuItemBuilder::with_id("menu_command_palette", "Command Palette...")
        .accelerator("CmdOrCtrl+Shift+P")
        .build(app)?;
    let zoom_in = MenuItemBuilder::with_id("menu_zoom_in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("menu_zoom_out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let reset_zoom = MenuItemBuilder::with_id("menu_reset_zoom", "Reset Zoom")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;
    let view_sep = PredefinedMenuItem::separator(app)?;
    let view_menu = Submenu::with_items(
        app, "View", true,
        &[&command_palette, &view_sep, &zoom_in, &zoom_out, &reset_zoom],
    )?;
    menu.append(&view_menu)?;

    // Window menu (macOS only)
    #[cfg(target_os = "macos")]
    {
        let minimize = PredefinedMenuItem::minimize(app, None)?;
        let maximize = PredefinedMenuItem::maximize(app, None)?;
        let window_menu = Submenu::with_items(
            app, "Window", true,
            &[&minimize, &maximize],
        )?;
        menu.append(&window_menu)?;
    }

    Ok(menu)
}

pub fn handle_menu_event(app: &AppHandle, event: &tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();
    match id {
        "menu_new_file" => {
            emit_to_focused(app, "menu-new-file", ());
        }
        "menu_new_window" => {
            match create_new_window(app) {
                Ok(w) => eprintln!("New window created: {}", w.label()),
                Err(e) => eprintln!("{}", e),
            }
        }
        "menu_open_folder" => {
            emit_to_focused(app, "menu-open-folder", ());
        }
        "menu_save" => {
            emit_to_focused(app, "menu-save", ());
        }
        "menu_save_as" => {
            emit_to_focused(app, "menu-save-as", ());
        }
        "menu_save_all" => {
            emit_to_focused(app, "menu-save-all", ());
        }
        "menu_auto_save" => {
            emit_to_focused(app, "menu-auto-save", ());
        }
        "menu_revert_file" => {
            emit_to_focused(app, "menu-revert-file", ());
        }
        "menu_close_editor" => {
            emit_to_focused(app, "menu-close-editor", ());
        }
        "menu_close_folder" => {
            emit_to_focused(app, "menu-close-folder", ());
        }
        "menu_command_palette" => {
            emit_to_focused(app, "menu-command-palette", ());
        }
        "menu_zoom_in" => {
            emit_to_focused(app, "menu-zoom", "in");
        }
        "menu_zoom_out" => {
            emit_to_focused(app, "menu-zoom", "out");
        }
        "menu_reset_zoom" => {
            emit_to_focused(app, "menu-zoom", "reset");
        }
        _ if id.starts_with("recent_") => {
            if let Ok(idx) = id.strip_prefix("recent_").unwrap_or("").parse::<usize>() {
                emit_to_focused(app, "menu-open-recent", idx);
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub fn update_recent_menu(app: AppHandle, paths: Vec<String>, auto_save: bool) -> Result<(), String> {
    let menu = build_app_menu(&app, &paths, auto_save).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
