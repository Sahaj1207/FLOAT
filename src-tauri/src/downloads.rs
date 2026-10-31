//! Finished downloads, including files received with Nearby Share (which
//! saves into Downloads), announced as a live activity.
//!
//! Polls the Downloads folder: a new file is reported once its size has
//! stopped changing and it no longer has a partial-download extension.

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_millis(1500);
const PARTIAL: [&str; 6] = ["crdownload", "part", "partial", "download", "tmp", "opdownload"];

static ENABLED: AtomicBool = AtomicBool::new(true);

#[derive(Clone, Serialize)]
pub struct DownloadPayload {
    name: String,
    path: String,
    size: u64,
}

fn is_partial(path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    name.starts_with('.')
        || name.starts_with('~')
        || name == "desktop.ini"
        || path.extension().map_or(false, |e| PARTIAL.contains(&e.to_string_lossy().to_lowercase().as_str()))
}

fn snapshot(dir: &Path) -> HashMap<PathBuf, u64> {
    let Ok(read) = std::fs::read_dir(dir) else { return HashMap::new() };
    read.flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            meta.is_file().then(|| (e.path(), meta.len()))
        })
        .collect()
}

pub fn init(app: &tauri::App) {
    let Some(dir) = crate::search::downloads_folder() else { return };
    let app = app.handle().clone();
    std::thread::spawn(move || watch(app, dir));
}

fn watch(app: AppHandle, dir: PathBuf) {
    let mut known: HashSet<PathBuf> = snapshot(&dir).into_keys().collect();
    // New files seen last poll, with their size then.
    let mut pending: HashMap<PathBuf, u64> = HashMap::new();
    loop {
        std::thread::sleep(POLL);
        let now = snapshot(&dir);
        for (path, size) in &now {
            if known.contains(path) || is_partial(path) || *size == 0 {
                continue;
            }
            match pending.get(path) {
                Some(prev) if prev == size => {
                    pending.remove(path);
                    known.insert(path.clone());
                    if ENABLED.load(Ordering::Relaxed) {
                        dlog!("[DOWNLOADS] finished {}", path.display());
                        let _ = app.emit(
                            "download-finished",
                            DownloadPayload {
                                name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                                path: path.to_string_lossy().into_owned(),
                                size: *size,
                            },
                        );
                    }
                }
                _ => {
                    pending.insert(path.clone(), *size);
                }
            }
        }
        known.retain(|p| now.contains_key(p));
        pending.retain(|p, _| now.contains_key(p));
    }
}

#[tauri::command]
pub fn set_download_alerts(enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
}

/// Open (or reveal) a file, only if it's directly inside Downloads.
#[tauri::command]
pub fn open_download(path: String, reveal: bool) -> Result<(), String> {
    let dir = crate::search::downloads_folder().ok_or("no Downloads folder")?;
    let path = PathBuf::from(&path);
    if path.parent() != Some(dir.as_path()) || !path.is_file() {
        return Err("not a download".into());
    }
    let mut cmd = std::process::Command::new("explorer");
    if reveal {
        cmd.arg(format!("/select,{}", path.display()));
    } else {
        cmd.arg(&path);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_partial_downloads() {
        assert!(is_partial(Path::new(r"C:\d\movie.mp4.crdownload")));
        assert!(is_partial(Path::new(r"C:\d\x.part")));
        assert!(!is_partial(Path::new(r"C:\d\photo.jpg")));
    }
}
