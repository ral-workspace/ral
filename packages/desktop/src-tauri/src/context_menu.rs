use serde::Deserialize;
use std::sync::Arc;
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

#[derive(Deserialize)]
#[serde(tag = "type")]
pub(crate) enum MenuItemDef {
    #[serde(rename = "item")]
    Item {
        id: String,
        label: String,
        #[serde(default)]
        disabled: bool,
    },
    #[serde(rename = "separator")]
    Separator,
    #[serde(rename = "submenu")]
    Submenu {
        label: String,
        items: Vec<MenuItemDef>,
    },
    #[serde(rename = "check")]
    Check {
        id: String,
        label: String,
        #[serde(default)]
        checked: bool,
        #[serde(default)]
        disabled: bool,
    },
}

#[tauri::command]
pub(crate) async fn show_context_menu(
    app: AppHandle,
    items: Vec<MenuItemDef>,
) -> Result<Option<String>, String> {
    let (tx, rx) = oneshot::channel::<String>();
    let tx = Arc::new(std::sync::Mutex::new(Some(tx)));

    let window = app
        .get_webview_window("main")
        .ok_or("No main window")?;

    let menu = build_menu(&app, &items)?;

    let tx_clone = tx.clone();
    app.on_menu_event(move |_app, event| {
        let id = event.id().0.clone();
        if let Some(sender) = tx_clone.lock().unwrap().take() {
            let _ = sender.send(id);
        }
    });

    window.popup_menu(&menu).map_err(|e| e.to_string())?;

    // popup_menu is blocking — by the time we get here, user has either
    // selected an item (tx sent) or dismissed the menu (tx dropped).
    drop(tx);

    match rx.await {
        Ok(id) => Ok(Some(id)),
        Err(_) => Ok(None),
    }
}

fn build_menu(app: &AppHandle, items: &[MenuItemDef]) -> Result<Menu<tauri::Wry>, String> {
    let native_items = build_items(app, items)?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        native_items.iter().map(|i| i.as_dyn()).collect();
    Menu::with_items(app, &refs).map_err(|e| e.to_string())
}

fn build_submenu(
    app: &AppHandle,
    label: &str,
    items: &[MenuItemDef],
) -> Result<Submenu<tauri::Wry>, String> {
    let native_items = build_items(app, items)?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        native_items.iter().map(|i| i.as_dyn()).collect();
    Submenu::with_items(app, label, true, &refs).map_err(|e| e.to_string())
}

enum NativeItem {
    MenuItem(tauri::menu::MenuItem<tauri::Wry>),
    Separator(tauri::menu::PredefinedMenuItem<tauri::Wry>),
    Submenu(tauri::menu::Submenu<tauri::Wry>),
    Check(tauri::menu::CheckMenuItem<tauri::Wry>),
}

impl NativeItem {
    fn as_dyn(&self) -> &dyn tauri::menu::IsMenuItem<tauri::Wry> {
        match self {
            NativeItem::MenuItem(i) => i,
            NativeItem::Separator(i) => i,
            NativeItem::Submenu(i) => i,
            NativeItem::Check(i) => i,
        }
    }
}

fn build_items(app: &AppHandle, items: &[MenuItemDef]) -> Result<Vec<NativeItem>, String> {
    items.iter().map(|item| build_item(app, item)).collect()
}

fn build_item(app: &AppHandle, item: &MenuItemDef) -> Result<NativeItem, String> {
    match item {
        MenuItemDef::Item {
            id,
            label,
            disabled,
        } => {
            let mi = MenuItemBuilder::with_id(id, label)
                .enabled(!disabled)
                .build(app)
                .map_err(|e| e.to_string())?;
            Ok(NativeItem::MenuItem(mi))
        }
        MenuItemDef::Separator => {
            let sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
            Ok(NativeItem::Separator(sep))
        }
        MenuItemDef::Submenu {
            label,
            items: sub_items,
        } => {
            let submenu = build_submenu(app, label, sub_items)?;
            Ok(NativeItem::Submenu(submenu))
        }
        MenuItemDef::Check {
            id,
            label,
            checked,
            disabled,
        } => {
            let ci = CheckMenuItemBuilder::new(label)
                .id(id)
                .checked(*checked)
                .enabled(!disabled)
                .build(app)
                .map_err(|e| e.to_string())?;
            Ok(NativeItem::Check(ci))
        }
    }
}
