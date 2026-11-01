//! System tray icon, and what it and the global shortcuts send to the island.

use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use crate::hotkeys::{self, Action};
use tauri_plugin_global_shortcut::ShortcutState;

/// Sent to the frontend as `island-command`.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IslandCommand {
    Open,
    Toggle,
    /// Open straight into search (or close it if it's showing).
    Search,
    /// Open the paste picker.
    Paste,
}

struct TrayItems {
    visible: CheckMenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
}

/// Bring the island back if hidden, focus it, and ask the UI to open/toggle.
pub fn command_island(app: &AppHandle, command: IslandCommand) {
    crate::window::set_user_hidden(app, false);
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.visible.set_checked(true);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("island-command", command);
}

pub fn sync_autostart(app: &AppHandle, enabled: bool) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.autostart.set_checked(enabled);
    }
}

// The frontend asks for each shortcut's label to show it.
#[tauri::command]
pub fn get_hotkey(app: AppHandle) -> Option<String> {
    hotkeys::label_for(&app, Action::Open)
}

#[tauri::command]
pub fn get_paste_hotkey(app: AppHandle) -> Option<String> {
    hotkeys::label_for(&app, Action::Paste)
}

#[tauri::command]
pub fn get_mic_hotkey(app: AppHandle) -> Option<String> {
    hotkeys::label_for(&app, Action::Mic)
}

#[tauri::command]
pub fn get_text_hotkey(app: AppHandle) -> Option<String> {
    hotkeys::label_for(&app, Action::Text)
}

#[tauri::command]
pub fn get_search_hotkey(app: AppHandle) -> Option<String> {
    hotkeys::label_for(&app, Action::Search)
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    hotkeys::init(app);
    let hotkey = hotkeys::label_for(app.handle(), Action::Open);

    let visible = CheckMenuItem::with_id(app, "visible", "Show Island", true, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Island", true, hotkey.as_deref())?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset Position", true, None::<&str>)?;
    let updates = MenuItem::with_id(app, "updates", "Check for Updates…", true, None::<&str>)?;
    let autostart =
        CheckMenuItem::with_id(app, "autostart", "Launch at Startup", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit FLOAT", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &visible,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &updates,
            &PredefinedMenuItem::separator(app)?,
            &reset,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    app.manage(TrayItems {
        visible: visible.clone(),
        autostart: autostart.clone(),
    });

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("FLOAT")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => command_island(app, IslandCommand::Open),
            "settings" => crate::settingswin::open(app, None),
            "updates" => crate::settingswin::open(app, Some("updates-check")),
            "visible" => {
                let hidden = !crate::window::is_user_hidden(app);
                crate::window::set_user_hidden(app, hidden);
                if let Some(items) = app.try_state::<TrayItems>() {
                    let _ = items.visible.set_checked(!hidden);
                }
            }
            "reset" => crate::window::reset_position(app),
            "autostart" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let want = !crate::autostart::is_enabled().await;
                    crate::autostart::set_autostart(app, want).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                command_island(tray.app_handle(), IslandCommand::Open);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    // Reflect the real autostart state once it is known.
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let enabled = crate::autostart::is_enabled().await;
        sync_autostart(&handle, enabled);
    });
    Ok(())
}

pub fn global_shortcut_plugin() -> tauri::plugin::TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match hotkeys::action_for(app, shortcut) {
                Some(Action::Text) => crate::textgrab::start(app),
                Some(Action::Paste) => {
                    // Before the island takes focus: that's where we'll paste.
                    crate::paste::remember_foreground(app);
                    command_island(app, IslandCommand::Paste);
                }
                // Off the event loop; sysmon announces the new state.
                Some(Action::Mic) => {
                    std::thread::spawn(crate::micmute::toggle);
                }
                Some(Action::Search) => command_island(app, IslandCommand::Search),
                Some(Action::Open) => command_island(app, IslandCommand::Toggle),
                None => {}
            }
        })
        .build()
}
