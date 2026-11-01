//! System tray icon, global hotkey and the commands they send to the island.

use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Registered after the open hotkey, so adding search never moves the
/// shortcut people already use. Without one, typing in the open island
/// still jumps to search.
const SEARCH_HOTKEYS: [(Modifiers, Code, &str); 2] = [
    (Modifiers::ALT, Code::Space, "Alt+Space"),
    (Modifiers::ALT.union(Modifiers::SHIFT), Code::Space, "Alt+Shift+Space"),
];

/// Copy Text from Anything.
const TEXT_HOTKEYS: [(Modifiers, Code, &str); 2] = [
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::KeyT, "Ctrl+Alt+T"),
    (Modifiers::ALT.union(Modifiers::SHIFT), Code::KeyT, "Alt+Shift+T"),
];

/// Paste picker (clipboard history and pinned snippets).
const PASTE_HOTKEYS: [(Modifiers, Code, &str); 2] = [
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::KeyV, "Ctrl+Alt+V"),
    (Modifiers::ALT.union(Modifiers::SHIFT), Code::KeyV, "Alt+Shift+V"),
];

/// Microphone mute.
const MIC_HOTKEYS: [(Modifiers, Code, &str); 2] = [
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::KeyM, "Ctrl+Alt+M"),
    (Modifiers::ALT.union(Modifiers::SHIFT), Code::KeyM, "Alt+Shift+M"),
];

/// Tried in order; the first combination no other app owns wins.
const HOTKEYS: [(Modifiers, Code, &str); 3] = [
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::Space, "Ctrl+Alt+Space"),
    (Modifiers::ALT.union(Modifiers::SHIFT), Code::Space, "Alt+Shift+Space"),
    (Modifiers::CONTROL.union(Modifiers::ALT), Code::KeyI, "Ctrl+Alt+I"),
];

/// The hotkeys that were actually registered, if any.
pub struct ActiveHotkeys {
    open: Option<(Shortcut, &'static str)>,
    search: Option<(Shortcut, &'static str)>,
    text: Option<(Shortcut, &'static str)>,
    mic: Option<(Shortcut, &'static str)>,
    paste: Option<(Shortcut, &'static str)>,
}

/// Sent to the frontend as `island-command`.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IslandCommand {
    Open,
    Toggle,
    /// Open straight into search (or close it if it's showing).
    Search,
    /// Open Settings > Updates and check now.
    Updates,
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

fn register_first(app: &tauri::App, choices: &[(Modifiers, Code, &'static str)]) -> Option<(Shortcut, &'static str)> {
    for &(mods, code, label) in choices {
        let shortcut = Shortcut::new(Some(mods), code);
        match app.global_shortcut().register(shortcut) {
            Ok(()) => return Some((shortcut, label)),
            Err(e) => dlog!("[TRAY] {} unavailable: {}", label, e),
        }
    }
    None
}

#[tauri::command]
pub fn get_hotkey(state: tauri::State<'_, ActiveHotkeys>) -> Option<String> {
    state.open.map(|(_, label)| label.to_string())
}

#[tauri::command]
pub fn get_paste_hotkey(state: tauri::State<'_, ActiveHotkeys>) -> Option<String> {
    state.paste.map(|(_, label)| label.to_string())
}

#[tauri::command]
pub fn get_mic_hotkey(state: tauri::State<'_, ActiveHotkeys>) -> Option<String> {
    state.mic.map(|(_, label)| label.to_string())
}

#[tauri::command]
pub fn get_text_hotkey(state: tauri::State<'_, ActiveHotkeys>) -> Option<String> {
    state.text.map(|(_, label)| label.to_string())
}

#[tauri::command]
pub fn get_search_hotkey(state: tauri::State<'_, ActiveHotkeys>) -> Option<String> {
    state.search.map(|(_, label)| label.to_string())
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open_key = register_first(app, &HOTKEYS);
    let search = register_first(app, &SEARCH_HOTKEYS);
    let text = register_first(app, &TEXT_HOTKEYS);
    let mic = register_first(app, &MIC_HOTKEYS);
    let paste = register_first(app, &PASTE_HOTKEYS);
    if open_key.is_none() {
        eprintln!("[TRAY] No global hotkey could be registered");
    }
    let hotkey = open_key.map(|(_, label)| label);
    app.manage(ActiveHotkeys { open: open_key, search, text, mic, paste });

    let visible = CheckMenuItem::with_id(app, "visible", "Show Island", true, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Island", true, hotkey)?;
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
            &reset,
            &autostart,
            &updates,
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
            "updates" => command_island(app, IslandCommand::Updates),
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
            let keys = app.try_state::<ActiveHotkeys>();
            let matches = |pick: fn(&ActiveHotkeys) -> Option<(Shortcut, &'static str)>| {
                keys.as_ref().and_then(|k| pick(k)).map_or(false, |(key, _)| key == *shortcut)
            };
            if matches(|k| k.text) {
                crate::textgrab::start(app);
                return;
            }
            if matches(|k| k.paste) {
                // Before the island takes focus: that's where we'll paste.
                crate::paste::remember_foreground(app);
                command_island(app, IslandCommand::Paste);
                return;
            }
            if matches(|k| k.mic) {
                // Off the event loop; sysmon announces the new state.
                std::thread::spawn(crate::micmute::toggle);
                return;
            }
            let is_search = matches(|k| k.search);
            command_island(app, if is_search { IslandCommand::Search } else { IslandCommand::Toggle });
        })
        .build()
}
