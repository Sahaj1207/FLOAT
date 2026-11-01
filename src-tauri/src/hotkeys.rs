//! Global keyboard shortcuts: defaults, and changing them from Settings.
//!
//! Each action gets the first default combination no other app owns. The
//! user can record their own in Settings > Keyboard (applied at startup from
//! saved settings), turn one off, or reset it.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Open,
    Search,
    Text,
    Paste,
    Mic,
}

const ACTIONS: [Action; 5] = [Action::Open, Action::Search, Action::Text, Action::Paste, Action::Mic];

const CTRL_ALT: Modifiers = Modifiers::CONTROL.union(Modifiers::ALT);
const ALT_SHIFT: Modifiers = Modifiers::ALT.union(Modifiers::SHIFT);

/// Tried in order; the first combination no other app owns wins. Open goes
/// first so adding shortcuts never moves the one people already use.
fn defaults(action: Action) -> &'static [(Modifiers, Code)] {
    match action {
        Action::Open => &[(CTRL_ALT, Code::Space), (ALT_SHIFT, Code::Space), (CTRL_ALT, Code::KeyI)],
        Action::Search => &[(Modifiers::ALT, Code::Space), (ALT_SHIFT, Code::Space)],
        Action::Text => &[(CTRL_ALT, Code::KeyT), (ALT_SHIFT, Code::KeyT)],
        Action::Paste => &[(CTRL_ALT, Code::KeyV), (ALT_SHIFT, Code::KeyV)],
        Action::Mic => &[(CTRL_ALT, Code::KeyM), (ALT_SHIFT, Code::KeyM)],
    }
}

#[derive(Default)]
struct Inner {
    active: HashMap<Action, Shortcut>,
    /// Unregistered while Settings records a new combination.
    paused: bool,
}

pub struct Hotkeys(Mutex<Inner>);

/// "Ctrl+Alt+V", the way Windows shows shortcuts.
pub fn label(shortcut: &Shortcut) -> String {
    let mut parts = Vec::new();
    let m = shortcut.mods;
    if m.contains(Modifiers::CONTROL) {
        parts.push("Ctrl".to_string());
    }
    if m.contains(Modifiers::ALT) {
        parts.push("Alt".to_string());
    }
    if m.contains(Modifiers::SHIFT) {
        parts.push("Shift".to_string());
    }
    if m.contains(Modifiers::SUPER) {
        parts.push("Win".to_string());
    }
    let key = format!("{:?}", shortcut.key);
    let key = key
        .strip_prefix("Key")
        .or_else(|| key.strip_prefix("Digit"))
        .map(str::to_string)
        .unwrap_or_else(|| match key.as_str() {
            "Backquote" => "`".into(),
            "Minus" => "-".into(),
            "Equal" => "=".into(),
            "Comma" => ",".into(),
            "Period" => ".".into(),
            "Slash" => "/".into(),
            "Semicolon" => ";".into(),
            "Quote" => "'".into(),
            "BracketLeft" => "[".into(),
            "BracketRight" => "]".into(),
            "Backslash" => "\\".into(),
            other => other.to_string(),
        });
    parts.push(key);
    parts.join("+")
}

fn state<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, Hotkeys> {
    app.state::<Hotkeys>()
}

pub fn init(app: &tauri::App) {
    let mut inner = Inner::default();
    for action in ACTIONS {
        for &(mods, code) in defaults(action) {
            let shortcut = Shortcut::new(Some(mods), code);
            if inner.active.values().any(|s| *s == shortcut) {
                continue;
            }
            match app.global_shortcut().register(shortcut) {
                Ok(()) => {
                    inner.active.insert(action, shortcut);
                    break;
                }
                Err(e) => dlog!("[HOTKEYS] {:?} {} unavailable: {}", action, label(&shortcut), e),
            }
        }
    }
    if !inner.active.contains_key(&Action::Open) {
        eprintln!("[HOTKEYS] No shortcut could be registered to open the island");
    }
    app.manage(Hotkeys(Mutex::new(inner)));
}

/// Which action a pressed shortcut belongs to.
pub fn action_for<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) -> Option<Action> {
    let state = app.try_state::<Hotkeys>()?;
    let inner = state.0.lock().ok()?;
    inner.active.iter().find(|(_, s)| *s == shortcut).map(|(a, _)| *a)
}

pub fn label_for<R: Runtime>(app: &AppHandle<R>, action: Action) -> Option<String> {
    let state = app.try_state::<Hotkeys>()?;
    let inner = state.0.lock().ok()?;
    inner.active.get(&action).map(label)
}

#[derive(Serialize)]
pub struct ShortcutInfo {
    action: Action,
    label: Option<String>,
}

#[tauri::command]
pub fn get_shortcuts(app: AppHandle) -> Vec<ShortcutInfo> {
    ACTIONS.iter().map(|&action| ShortcutInfo { action, label: label_for(&app, action) }).collect()
}

/// Set an action's shortcut: an accelerator like "Ctrl+Alt+V", "default" to
/// go back to the built-in choice, or None to turn it off. Returns the label
/// now in use, or a message saying why it couldn't be used.
#[tauri::command]
pub fn set_shortcut(app: AppHandle, action: Action, accelerator: Option<String>) -> Result<Option<String>, String> {
    let state = state(&app);
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    let gs = app.global_shortcut();
    let previous = inner.active.remove(&action);
    if let Some(old) = previous {
        if !inner.paused {
            let _ = gs.unregister(old);
        }
    }

    let candidates: Vec<Shortcut> = match accelerator.as_deref() {
        None => return Ok(None),
        Some("default") => defaults(action).iter().map(|&(m, c)| Shortcut::new(Some(m), c)).collect(),
        Some(text) => vec![Shortcut::from_str(text).map_err(|_| format!("{text} isn't a shortcut FLOAT can use"))?],
    };
    let mut last_error = String::from("No free combination");
    for shortcut in candidates {
        if let Some((other, _)) = inner.active.iter().find(|(_, s)| **s == shortcut) {
            last_error = format!("{} is already used for {}", label(&shortcut), name(*other));
            continue;
        }
        if inner.paused || gs.register(shortcut).is_ok() {
            inner.active.insert(action, shortcut);
            return Ok(Some(label(&shortcut)));
        }
        last_error = format!("Another app already uses {}", label(&shortcut));
    }
    // Couldn't use the new one: keep the old shortcut.
    if let Some(old) = previous {
        if inner.paused || gs.register(old).is_ok() {
            inner.active.insert(action, old);
        }
    }
    Err(last_error)
}

/// Settings records a combination by listening for keys, which a registered
/// global shortcut would swallow: pause them all meanwhile.
#[tauri::command]
pub fn pause_shortcuts(app: AppHandle, paused: bool) {
    let state = state(&app);
    let Ok(mut inner) = state.0.lock() else { return };
    if inner.paused == paused {
        return;
    }
    inner.paused = paused;
    let gs = app.global_shortcut();
    let keys: Vec<Shortcut> = inner.active.values().copied().collect();
    for shortcut in keys {
        if paused {
            let _ = gs.unregister(shortcut);
        } else {
            let _ = gs.register(shortcut);
        }
    }
}

fn name(action: Action) -> &'static str {
    match action {
        Action::Open => "Open FLOAT",
        Action::Search => "Search",
        Action::Text => "Copy Text",
        Action::Paste => "Paste",
        Action::Mic => "Mute microphone",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_like_windows() {
        assert_eq!(label(&Shortcut::new(Some(CTRL_ALT), Code::KeyV)), "Ctrl+Alt+V");
        assert_eq!(label(&Shortcut::new(Some(ALT_SHIFT), Code::Space)), "Alt+Shift+Space");
        assert_eq!(label(&Shortcut::new(Some(Modifiers::CONTROL), Code::Digit1)), "Ctrl+1");
    }

    #[test]
    fn parses_what_settings_records() {
        let s = Shortcut::from_str("Ctrl+Alt+V").unwrap();
        assert_eq!(s, Shortcut::new(Some(CTRL_ALT), Code::KeyV));
        let s = Shortcut::from_str("Ctrl+Shift+F5").unwrap();
        assert_eq!(label(&s), "Ctrl+Shift+F5");
    }
}
