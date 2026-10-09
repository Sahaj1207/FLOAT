//! The file shelf: files dropped on the notch are parked here (as
//! references, not copies) until dragged out or removed. Persisted to
//! shelf.json in the app data dir.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use windows::core::HSTRING;
use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName};

const MAX_ITEMS: usize = 48;
const THUMB_SIZE: i32 = 96;

#[derive(Default)]
pub struct ShelfState {
    paths: Mutex<Vec<PathBuf>>,
}

#[derive(Clone, Serialize)]
pub struct ShelfItem {
    path: String,
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

fn shelf_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("shelf.json"))
}

fn save(app: &AppHandle, paths: &[PathBuf]) {
    let Some(file) = shelf_file(app) else { return };
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(paths) {
        let _ = std::fs::write(file, text);
    }
}

/// Current items, dropping any whose file has since been moved or deleted.
fn items(app: &AppHandle) -> Vec<ShelfItem> {
    let state = app.state::<ShelfState>();
    let mut paths = state.paths.lock().unwrap();
    let before = paths.len();
    paths.retain(|p| p.exists());
    if paths.len() != before {
        save(app, &paths);
    }
    paths
        .iter()
        .map(|p| ShelfItem {
            path: p.to_string_lossy().into_owned(),
            name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            is_dir: p.is_dir(),
        })
        .collect()
}

/// Only paths already on the shelf may be opened, revealed or rendered.
fn on_shelf(app: &AppHandle, path: &str) -> Option<PathBuf> {
    let state = app.state::<ShelfState>();
    let paths = state.paths.lock().unwrap();
    paths.iter().find(|p| p.as_path() == Path::new(path)).cloned()
}

pub fn init(app: &tauri::App) {
    let state = ShelfState::default();
    if let Some(text) = shelf_file(app.handle()).and_then(|f| std::fs::read_to_string(f).ok()) {
        if let Ok(paths) = serde_json::from_str::<Vec<PathBuf>>(&text) {
            *state.paths.lock().unwrap() = paths;
        }
    }
    app.manage(state);
}

#[tauri::command]
pub fn get_shelf(app: AppHandle) -> Vec<ShelfItem> {
    items(&app)
}

/// Add dropped paths (newest first, no duplicates).
#[tauri::command]
pub fn add_to_shelf(app: AppHandle, paths: Vec<String>) -> Vec<ShelfItem> {
    {
        let state = app.state::<ShelfState>();
        let mut shelf = state.paths.lock().unwrap();
        // Normalize separators: shell APIs reject forward-slash paths.
        let paths = paths.into_iter().rev().map(|p| PathBuf::from(p.replace('/', "\\")));
        for path in paths.filter(|p| p.exists()) {
            shelf.retain(|p| p != &path);
            shelf.insert(0, path);
        }
        shelf.truncate(MAX_ITEMS);
        save(&app, &shelf);
    }
    items(&app)
}

#[tauri::command]
pub fn remove_from_shelf(app: AppHandle, path: String) -> Vec<ShelfItem> {
    {
        let state = app.state::<ShelfState>();
        let mut shelf = state.paths.lock().unwrap();
        shelf.retain(|p| p.as_path() != Path::new(&path));
        save(&app, &shelf);
    }
    items(&app)
}

#[tauri::command]
pub fn clear_shelf(app: AppHandle) -> Vec<ShelfItem> {
    let state = app.state::<ShelfState>();
    state.paths.lock().unwrap().clear();
    save(&app, &[]);
    Vec::new()
}

/// Open with the default app, or reveal in Explorer.
#[tauri::command]
pub fn open_shelf_item(app: AppHandle, path: String, reveal: bool) -> Result<(), String> {
    let path = on_shelf(&app, &path).ok_or("not on the shelf")?;
    let mut cmd = std::process::Command::new("explorer");
    if reveal {
        cmd.arg(format!("/select,{}", path.display()));
    } else {
        cmd.arg(&path);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn render_thumbnail(path: &Path) -> Option<Vec<u8>> {
    crate::appicon::com_init_sta();
    let factory: IShellItemImageFactory =
        unsafe { SHCreateItemFromParsingName(&HSTRING::from(path.as_os_str()), None).ok()? };
    crate::appicon::render_shell_image(&factory, THUMB_SIZE, false)
}

/// Thumbnail (images, videos, documents) or icon of a shelf item, base64 PNG.
#[tauri::command]
pub async fn get_shelf_thumbnail(app: AppHandle, path: String) -> Option<String> {
    let path = on_shelf(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || render_thumbnail(&path))
        .await
        .ok()
        .flatten()
        .map(|png| STANDARD.encode(png))
}

/// Write a shelf item's thumbnail to a temp PNG to use as the drag image.
#[tauri::command]
pub async fn shelf_drag_icon(app: AppHandle, path: String) -> Option<String> {
    let path = on_shelf(&app, &path)?;
    let out = std::env::temp_dir().join("float-shelf-drag.png");
    let out_clone = out.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let png = render_thumbnail(&path)?;
        std::fs::write(&out_clone, png).ok()
    })
    .await
    .ok()
    .flatten()?;
    Some(out.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Renders a thumbnail for a real file and writes it next to it (read-only on the source).
    #[test]
    #[ignore = "needs FLOAT_THUMB_TEST=path"]
    fn renders_thumbnail() {
        let src = std::env::var("FLOAT_THUMB_TEST").unwrap();
        let png = render_thumbnail(Path::new(&src)).expect("thumbnail");
        std::fs::write(format!("{src}.thumb.png"), png).unwrap();
    }
}
