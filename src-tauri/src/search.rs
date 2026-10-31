//! Spotlight-style search: apps, files and folders in the user's own folders,
//! and Settings pages. Everything is indexed locally in memory; nothing is
//! sent anywhere.
//!
//! Apps come from `Get-StartApps` (Win32 and packaged apps, with the AUMIDs
//! `appicon.rs` renders icons for). Files come from a shallow walk of the
//! known user folders. The index rebuilds in the background when stale.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use windows::core::{GUID, HSTRING};
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemFromParsingName, SHGetKnownFolderPath, FOLDERID_Desktop,
    FOLDERID_Documents, FOLDERID_Downloads, FOLDERID_Music, FOLDERID_Pictures, FOLDERID_Videos,
    KF_FLAG_DEFAULT,
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const STALE_AFTER: Duration = Duration::from_secs(5 * 60);
const MAX_DEPTH: usize = 5;
const MAX_FILES: usize = 60_000;
const ICON_SIZE: i32 = 40;
const SKIP_DIRS: [&str; 10] = [
    "node_modules", "target", "appdata", "$recycle.bin", "__pycache__", "venv", ".venv", "dist", "build", "obj",
];

/// Settings pages worth finding by name: (title, extra keywords, URI).
const SETTINGS: [(&str, &str, &str); 24] = [
    ("Wi-Fi", "wifi wireless network internet", "ms-settings:network-wifi"),
    ("Bluetooth & devices", "bluetooth pair headphones mouse", "ms-settings:bluetooth"),
    ("Display", "screen resolution scale monitor", "ms-settings:display"),
    ("Night light", "blue light warm", "ms-settings:nightlight"),
    ("Sound", "audio volume speakers output", "ms-settings:sound"),
    ("Notifications", "alerts banners", "ms-settings:notifications"),
    ("Focus", "do not disturb quiet hours", "ms-settings:quiethours"),
    ("Power & battery", "battery saver sleep energy", "ms-settings:batterysaver"),
    ("Storage", "disk space cleanup", "ms-settings:storagesense"),
    ("Personalization", "background wallpaper theme colors", "ms-settings:personalization"),
    ("Background", "wallpaper desktop picture", "ms-settings:personalization-background"),
    ("Colors", "dark mode light mode accent", "ms-settings:colors"),
    ("Taskbar", "start menu", "ms-settings:taskbar"),
    ("Installed apps", "uninstall programs apps features", "ms-settings:appsfeatures"),
    ("Default apps", "browser open with", "ms-settings:defaultapps"),
    ("Startup apps", "launch login autostart", "ms-settings:startupapps"),
    ("Accounts", "user profile sign in", "ms-settings:yourinfo"),
    ("Date & time", "clock time zone", "ms-settings:dateandtime"),
    ("Language & region", "keyboard input", "ms-settings:regionlanguage"),
    ("Mouse", "pointer cursor scroll", "ms-settings:mousetouchpad"),
    ("Touchpad", "gestures trackpad", "ms-settings:devices-touchpad"),
    ("Privacy & security", "camera microphone location permissions", "ms-settings:privacy"),
    ("Windows Update", "updates upgrade", "ms-settings:windowsupdate"),
    ("VPN", "proxy network", "ms-settings:network-vpn"),
];

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    App,
    Setting,
    Folder,
    File,
}

#[derive(Clone)]
struct Entry {
    kind: Kind,
    name: String,
    lower: String,
    /// Extra words matched at a lower score (settings keywords).
    keywords: String,
    /// AUMID, settings URI, or full path.
    target: String,
    modified: Option<SystemTime>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    kind: Kind,
    name: String,
    /// What the UI shows under the name: "Application", a folder, ...
    detail: String,
    target: String,
}

#[derive(Default)]
struct Index {
    entries: Vec<Entry>,
    built: Option<Instant>,
}

fn index() -> &'static Mutex<Index> {
    static INDEX: OnceLock<Mutex<Index>> = OnceLock::new();
    INDEX.get_or_init(Default::default)
}

static BUILDING: AtomicBool = AtomicBool::new(false);

// --- Building ------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct StartApp {
    name: String,
    #[serde(rename = "AppID")]
    app_id: String,
}

fn start_apps() -> Vec<Entry> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", "Get-StartApps | ConvertTo-Json -Compress"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let Ok(output) = output else { return Vec::new() };
    let text = String::from_utf8_lossy(&output.stdout);
    let text = text.trim();
    // A single app comes back as an object, not an array.
    let apps: Vec<StartApp> = if text.starts_with('[') {
        serde_json::from_str(text).unwrap_or_default()
    } else {
        serde_json::from_str::<StartApp>(text).map(|a| vec![a]).unwrap_or_default()
    };
    let mut seen = HashSet::new();
    apps.into_iter()
        .filter(|a| {
            let lower = a.name.to_lowercase();
            !lower.starts_with("uninstall") && !lower.contains("readme") && seen.insert(lower)
        })
        .map(|a| Entry {
            kind: Kind::App,
            lower: a.name.to_lowercase(),
            name: a.name,
            keywords: String::new(),
            target: a.app_id,
            modified: None,
        })
        .collect()
}

fn known_folder(id: &GUID) -> Option<PathBuf> {
    unsafe {
        let raw = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let path = raw.to_string().ok();
        CoTaskMemFree(Some(raw.0 as *const _));
        path.map(PathBuf::from)
    }
}

pub fn downloads_folder() -> Option<PathBuf> {
    known_folder(&FOLDERID_Downloads)
}

fn user_folders() -> Vec<PathBuf> {
    let ids = [FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads, FOLDERID_Pictures, FOLDERID_Music, FOLDERID_Videos];
    let mut seen = HashSet::new();
    ids.iter()
        .filter_map(known_folder)
        .filter(|p| p.is_dir() && seen.insert(p.clone()))
        .collect()
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<Entry>) {
    if out.len() >= MAX_FILES {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else { return };
    for item in read.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let name = item.file_name().to_string_lossy().into_owned();
        let lower = name.to_lowercase();
        if name.starts_with('.') || name.starts_with('~') || lower == "desktop.ini" || lower.ends_with(".lnk") && depth > 0 {
            continue;
        }
        let Ok(meta) = item.metadata() else { continue };
        let is_dir = meta.is_dir();
        if is_dir && SKIP_DIRS.contains(&lower.as_str()) {
            continue;
        }
        let path = item.path();
        out.push(Entry {
            kind: if is_dir { Kind::Folder } else { Kind::File },
            name,
            lower,
            keywords: String::new(),
            target: path.to_string_lossy().into_owned(),
            modified: meta.modified().ok(),
        });
        if is_dir && depth + 1 < MAX_DEPTH {
            walk(&path, depth + 1, out);
        }
    }
}

fn build() -> Vec<Entry> {
    let mut entries = start_apps();
    entries.extend(SETTINGS.iter().map(|(name, keywords, uri)| Entry {
        kind: Kind::Setting,
        name: name.to_string(),
        lower: name.to_lowercase(),
        keywords: keywords.to_string(),
        target: uri.to_string(),
        modified: None,
    }));
    for folder in user_folders() {
        walk(&folder, 0, &mut entries);
    }
    entries
}

/// Rebuild on a background thread unless one is already running.
pub fn refresh() {
    if BUILDING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        let started = Instant::now();
        let entries = build();
        dlog!("[SEARCH] indexed {} items in {:?}", entries.len(), started.elapsed());
        if let Ok(mut idx) = index().lock() {
            idx.entries = entries;
            idx.built = Some(Instant::now());
        }
        BUILDING.store(false, Ordering::SeqCst);
    });
}

// --- Matching --------------------------------------------------------------------

/// How well `text` (lowercase) matches `query` (lowercase), 0 = no match.
fn match_score(text: &str, query: &str) -> u32 {
    if text == query {
        return 100;
    }
    if text.starts_with(query) {
        return 80;
    }
    let words: Vec<&str> = text
        .split(|c: char| c.is_whitespace() || "-_.()&,".contains(c))
        .filter(|w| !w.is_empty())
        .collect();
    if words.iter().any(|w| w.starts_with(query)) {
        return 65;
    }
    // Initials: "vsc" -> "Visual Studio Code".
    if query.len() >= 2 {
        let initials: String = words.iter().filter_map(|w| w.chars().next()).collect();
        if initials.starts_with(query) {
            return 55;
        }
    }
    if text.contains(query) {
        return 35;
    }
    0
}

fn score(entry: &Entry, query: &str, boosts: &HashMap<String, u32>) -> u32 {
    let mut s = match_score(&entry.lower, query);
    if s == 0 && !entry.keywords.is_empty() {
        s = match_score(&entry.keywords, query) / 2;
    }
    if s == 0 {
        return 0;
    }
    s += match entry.kind {
        Kind::App => 20,
        Kind::Setting => 10,
        Kind::Folder => 4,
        Kind::File => 0,
    };
    // Short names are usually the thing you meant ("Code" over "Code Helper").
    s += 10u32.saturating_sub(entry.name.len() as u32 / 4);
    if let Some(age) = entry.modified.and_then(|m| SystemTime::now().duration_since(m).ok()) {
        if age < Duration::from_secs(3 * 86_400) {
            s += 6;
        }
    }
    s + boosts.get(&entry.target).copied().unwrap_or(0).min(30)
}

fn detail(entry: &Entry) -> String {
    match entry.kind {
        Kind::App => "Application".into(),
        Kind::Setting => "Settings".into(),
        Kind::Folder | Kind::File => {
            let parent = Path::new(&entry.target).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
            // Show the path from the user's home, like Spotlight shows "Documents › Work".
            let home = std::env::var("USERPROFILE").unwrap_or_default();
            let rel = parent.strip_prefix(&home).map(|r| r.trim_start_matches('\\')).unwrap_or(&parent);
            rel.replace('\\', " › ")
        }
    }
}

/// Best matches for `query`. `boosts` maps targets the user opened often to a
/// bonus, so habits rank first.
#[tauri::command]
pub fn search(query: String, limit: usize, boosts: HashMap<String, u32>) -> Vec<SearchResult> {
    let query = query.trim().to_lowercase();
    let stale = index().lock().map(|i| i.built.map_or(true, |b| b.elapsed() > STALE_AFTER)).unwrap_or(true);
    if stale {
        refresh();
    }
    if query.is_empty() {
        return Vec::new();
    }
    let Ok(idx) = index().lock() else { return Vec::new() };
    let mut scored: Vec<(u32, &Entry)> = idx
        .entries
        .iter()
        .filter_map(|e| {
            let s = score(e, &query, &boosts);
            (s > 0).then_some((s, e))
        })
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name.len().cmp(&b.1.name.len())));
    scored
        .into_iter()
        .take(limit.min(50))
        .map(|(_, e)| SearchResult { kind: e.kind, name: e.name.clone(), detail: detail(e), target: e.target.clone() })
        .collect()
}

/// Whether the index has been built at least once.
#[tauri::command]
pub fn search_ready() -> bool {
    index().lock().map(|i| i.built.is_some()).unwrap_or(false)
}

fn indexed(target: &str) -> Option<Kind> {
    index().lock().ok()?.entries.iter().find(|e| e.target == target).map(|e| e.kind)
}

/// Open a result (only things in the index), or reveal a file in Explorer.
#[tauri::command]
pub fn search_open(target: String, reveal: bool) -> Result<(), String> {
    let kind = indexed(&target).ok_or("not a search result")?;
    let mut cmd = std::process::Command::new("explorer");
    match kind {
        Kind::App => cmd.arg(format!("shell:AppsFolder\\{target}")),
        Kind::Setting => cmd.arg(&target),
        Kind::Folder | Kind::File if reveal => cmd.arg(format!("/select,{target}")),
        Kind::Folder | Kind::File => cmd.arg(&target),
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn icon_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The shell icon of a file or folder result, base64 PNG.
#[tauri::command]
pub async fn search_icon(path: String) -> Option<String> {
    if !matches!(indexed(&path), Some(Kind::File | Kind::Folder)) {
        return None;
    }
    // Same type, same icon: cache files by extension, folders once.
    let p = Path::new(&path);
    let key = if p.is_dir() {
        "<folder>".to_string()
    } else {
        match p.extension().map(|e| e.to_string_lossy().to_lowercase()) {
            // These carry their own icons.
            Some(ext) if ["exe", "ico", "lnk", "url"].contains(&ext.as_str()) => path.clone(),
            Some(ext) => format!(".{ext}"),
            None => "<file>".to_string(),
        }
    };
    if let Some(cached) = icon_cache().lock().ok()?.get(&key) {
        return cached.clone();
    }
    let icon = tauri::async_runtime::spawn_blocking(move || {
        crate::appicon::com_init_sta();
        let factory: IShellItemImageFactory = unsafe { SHCreateItemFromParsingName(&HSTRING::from(path.as_str()), None).ok()? };
        crate::appicon::render_shell_image(&factory, ICON_SIZE, true).map(|png| STANDARD.encode(png))
    })
    .await
    .ok()
    .flatten();
    if let Ok(mut cache) = icon_cache().lock() {
        cache.insert(key, icon.clone());
    }
    icon
}

pub fn init() {
    // Build once shortly after launch, off the startup path.
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(4));
        refresh();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_matches() {
        assert_eq!(match_score("visual studio code", "visual studio code"), 100);
        assert_eq!(match_score("visual studio code", "vis"), 80);
        assert_eq!(match_score("visual studio code", "stu"), 65);
        assert_eq!(match_score("visual studio code", "vsc"), 55);
        assert_eq!(match_score("notepad", "pad"), 35);
        assert_eq!(match_score("notepad", "xyz"), 0);
    }

    #[test]
    fn finds_start_apps() {
        let apps = start_apps();
        assert!(!apps.is_empty(), "Get-StartApps returned nothing");
    }
}
