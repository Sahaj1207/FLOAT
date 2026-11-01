//! Your data, on disk: tasks, notes, pinned snippets, focus history and
//! settings, as JSON files in the app's local data folder.
//!
//! The web view's localStorage stays the fast copy the UI reads; these files
//! are the safe copy. Saves are atomic (write a temp file, keep the previous
//! version as .bak, swap in), and once a day the files are copied to
//! Documents\FLOAT\Backups (seven days kept), outside the app's folders so
//! they survive an uninstall. Export/Import bundle everything into one file.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// What FLOAT keeps. Anything else is refused.
const KEYS: [&str; 6] = ["settings", "tasks", "notes", "snippets", "focus", "focus-stats"];
const MAX_BYTES: usize = 5 * 1024 * 1024;
const KEEP_DAYS: usize = 7;

fn check_key(key: &str) -> Result<(), String> {
    if KEYS.contains(&key) {
        Ok(())
    } else {
        Err(format!("unknown data '{key}'"))
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn backups_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().document_dir().ok().map(|d| d.join("FLOAT").join("Backups"))
}

fn file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(format!("{key}.json")))
}

/// Read a JSON file, falling back to its .bak if it's damaged.
fn read_valid(path: &Path) -> Option<String> {
    let ok = |p: &Path| fs::read_to_string(p).ok().filter(|s| serde_json::from_str::<Value>(s).is_ok());
    ok(path).or_else(|| ok(&path.with_extension("json.bak")))
}

/// Write atomically: a crash mid-save never leaves a half-written file.
fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::copy(path, path.with_extension("json.bak"));
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Once a day, copy the data files to Documents\FLOAT\Backups\<date>, and
/// keep only the last week.
fn daily_backup(app: &AppHandle) {
    let (Ok(data), Some(root)) = (data_dir(app), backups_dir(app)) else { return };
    let day = root.join(today());
    if day.exists() {
        return;
    }
    if fs::create_dir_all(&day).is_err() {
        return;
    }
    for key in KEYS {
        let src = data.join(format!("{key}.json"));
        if src.exists() {
            let _ = fs::copy(&src, day.join(format!("{key}.json")));
        }
    }
    let Ok(entries) = fs::read_dir(&root) else { return };
    let mut days: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir() && p.file_name().map_or(false, |n| n.to_string_lossy().len() == 10))
        .collect();
    days.sort();
    while days.len() > KEEP_DAYS {
        let _ = fs::remove_dir_all(days.remove(0));
    }
}

#[tauri::command]
pub fn store_load(app: AppHandle, key: String) -> Result<Option<String>, String> {
    check_key(&key)?;
    Ok(read_valid(&file(&app, &key)?))
}

#[tauri::command]
pub fn store_save(app: AppHandle, key: String, value: String) -> Result<(), String> {
    check_key(&key)?;
    if value.len() > MAX_BYTES {
        return Err("too large".into());
    }
    serde_json::from_str::<Value>(&value).map_err(|_| "not valid data".to_string())?;
    daily_backup(&app);
    write_atomic(&file(&app, &key)?, &value)
}

#[derive(Serialize)]
pub struct Paths {
    data: String,
    backups: Option<String>,
}

#[tauri::command]
pub fn store_paths(app: AppHandle) -> Result<Paths, String> {
    Ok(Paths {
        data: data_dir(&app)?.to_string_lossy().into_owned(),
        backups: backups_dir(&app).map(|p| p.to_string_lossy().into_owned()),
    })
}

/// Open the data or backups folder in Explorer.
#[tauri::command]
pub fn store_reveal(app: AppHandle, backups: bool) -> Result<(), String> {
    let dir = if backups { backups_dir(&app).ok_or("no Documents folder")? } else { data_dir(&app)? };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer").arg(&dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// A whole-of-FLOAT backup file.
#[derive(Serialize, Deserialize)]
struct Bundle {
    app: String,
    version: String,
    exported: String,
    data: BTreeMap<String, Value>,
}

#[tauri::command]
pub fn export_data(app: AppHandle, path: String) -> Result<(), String> {
    let mut data = BTreeMap::new();
    for key in KEYS {
        if let Some(text) = read_valid(&file(&app, key)?) {
            data.insert(key.to_string(), serde_json::from_str(&text).map_err(|e| e.to_string())?);
        }
    }
    let bundle = Bundle {
        app: "FLOAT".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        exported: chrono::Local::now().to_rfc3339(),
        data,
    };
    let text = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| format!("Couldn't save the backup: {e}"))
}

/// Restore from an export (or a single file from the backups folder, by
/// name). Returns what was restored; the frontend then reloads.
#[tauri::command]
pub fn import_data(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let text = fs::read_to_string(&path).map_err(|e| format!("Couldn't read that file: {e}"))?;
    if text.len() > MAX_BYTES * KEYS.len() {
        return Err("That file is too large to be a FLOAT backup".into());
    }
    let mut restore: BTreeMap<String, Value> = BTreeMap::new();
    if let Ok(bundle) = serde_json::from_str::<Bundle>(&text) {
        if bundle.app != "FLOAT" {
            return Err("That isn't a FLOAT backup".into());
        }
        restore = bundle.data;
    } else {
        // A single file from Documents\FLOAT\Backups\<date>\tasks.json etc.
        let key = Path::new(&path).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        check_key(&key).map_err(|_| "That isn't a FLOAT backup".to_string())?;
        restore.insert(key, serde_json::from_str(&text).map_err(|_| "That file is damaged".to_string())?);
    }
    restore.retain(|k, _| KEYS.contains(&k.as_str()));
    if restore.is_empty() {
        return Err("That backup is empty".into());
    }
    daily_backup(&app);
    for (key, value) in &restore {
        write_atomic(&file(&app, key)?, &value.to_string())?;
    }
    Ok(restore.into_keys().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_keeps_previous_and_recovers() {
        let dir = std::env::temp_dir().join(format!("float-store-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tasks.json");
        write_atomic(&path, r#"[{"id":"a"}]"#).unwrap();
        write_atomic(&path, r#"[{"id":"b"}]"#).unwrap();
        assert_eq!(read_valid(&path).unwrap(), r#"[{"id":"b"}]"#);
        // A damaged current file falls back to the previous version.
        fs::write(&path, "{ half written").unwrap();
        assert_eq!(read_valid(&path).unwrap(), r#"[{"id":"a"}]"#);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_known_data() {
        assert!(check_key("tasks").is_ok());
        assert!(check_key("../secrets").is_err());
    }
}
