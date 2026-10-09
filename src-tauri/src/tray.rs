//! System tray icon, global hotkey and the commands they send to the island.

use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Tried in order; the first combination no other app owns wins.
const HOTKEYS: [(Modifiers, Code, &str); 3] = [
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::Space, "Ctrl+Alt+Space"),
    (Modifiers::ALT.union(Modifiers::SHIFT), Code::Space, "Alt+Shift+Space"),
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::KeyI, "Ctrl+Alt+I"),
];

/// The hotkey that was actually registered, if any.
pub struct ActiveHotkey(Option<&'static str>);

/// Sent to the frontend as `island-command`.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IslandCommand {
    Open,
    Toggle,
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

fn register_hotkey(app: &tauri::App) -> Option<&'static str> {
    for (mods, code, label) in HOTKEYS {
        match app.global_shortcut().register(Shortcut::new(Some(mods), code)) {
            Ok(()) => return Some(label),
            Err(e) => dlog!("[TRAY] {} unavailable: {}", label, e),
        }
    }
    eprintln!("[TRAY] No global hotkey could be registered");
    None
}

#[tauri::command]
pub fn get_hotkey(state: tauri::State<'_, ActiveHotkey>) -> Option<String> {
    state.0.map(str::to_string)
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let hotkey = register_hotkey(app);
    app.manage(ActiveHotkey(hotkey));

    let visible = CheckMenuItem::with_id(app, "visible", "Show Island", true, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Island", true, hotkey)?;
    let reset = MenuItem::with_id(app, "reset", "Reset Position", true, None::<&str>)?;
    let autostart =
        CheckMenuItem::with_id(app, "autostart", "Launch at Startup", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit FLOAT", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &visible,
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
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                command_island(app, IslandCommand::Toggle);
            }
        })
        .build()
}
