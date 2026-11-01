//! A local error log and a diagnostics report.
//!
//! Errors (and crashes, via a panic hook) go to logs\float.log in FLOAT's
//! data folder, capped at ~1 MB with one older file kept. "Copy diagnostics"
//! in Settings > About builds a short report to paste into an email or a
//! GitHub issue: versions, displays, shortcuts and recent errors. It never
//! includes notes, tasks, clipboard, calendar links or the city, and masks
//! the Windows user name. Nothing is ever sent anywhere by FLOAT.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const MAX_LOG: u64 = 1024 * 1024;
const REPORT_LINES: usize = 120;

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static LOG_LOCK: Mutex<()> = Mutex::new(());

/// Replace the user's name in paths, so reports can be shared.
fn mask(text: &str) -> String {
    match std::env::var("USERNAME") {
        Ok(user) if user.len() > 1 => text.replace(&user, "%USERNAME%"),
        _ => text.to_string(),
    }
}

/// Append a line to the log (and stderr). Safe to call from any thread.
pub fn write(level: &str, message: &str) {
    eprintln!("[{level}] {message}");
    let Some(path) = LOG_PATH.get() else { return };
    let _guard = LOG_LOCK.lock();
    if fs::metadata(path).map_or(false, |m| m.len() > MAX_LOG) {
        let _ = fs::rename(path, path.with_extension("log.1"));
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{} {level:5} {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), mask(message));
    }
}

/// Start logging, and record crashes before the default handler runs.
pub fn init(app: &tauri::App) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let logs = dir.join("logs");
        if fs::create_dir_all(&logs).is_ok() {
            let _ = LOG_PATH.set(logs.join("float.log"));
        }
    }
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info.location().map(|l| format!(" at {}:{}", l.file(), l.line())).unwrap_or_default();
        let what = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown".into());
        let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
        write("CRASH", &format!("thread '{thread}' panicked{place}: {what}"));
        default(info);
    }));
    write("INFO", &format!("FLOAT {} started", env!("CARGO_PKG_VERSION")));
}

/// Errors from the frontend (uncaught exceptions, failed promises).
#[tauri::command]
pub fn log_js_error(message: String) {
    write("JS", &message.chars().take(2000).collect::<String>());
}

fn windows_version() -> String {
    let out = std::process::Command::new("cmd")
        .args(["/C", "ver"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    if out.is_empty() {
        "unknown".into()
    } else {
        out
    }
}

fn recent_log() -> String {
    let Some(path) = LOG_PATH.get() else { return "(no log)".into() };
    let text = fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(REPORT_LINES)..].join("\n")
}

/// The report for "Copy diagnostics". `ui` carries frontend facts (settings
/// summary, screen) gathered without personal content.
#[tauri::command]
pub fn diagnostics(app: AppHandle, ui: String) -> String {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    let channel = if exe.to_lowercase().contains("\\windowsapps\\") { "MSIX" } else { "Setup program" };
    let monitors = app
        .get_webview_window("main")
        .and_then(|w| w.available_monitors().ok())
        .map(|ms| {
            ms.iter()
                .map(|m| format!("{}x{} @ {:.0}%", m.size().width, m.size().height, m.scale_factor() * 100.0))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_else(|| "unknown".into());
    let shortcuts = crate::hotkeys::get_shortcuts(app.clone())
        .into_iter()
        .map(|s| serde_json::to_string(&s).unwrap_or_default())
        .collect::<Vec<_>>()
        .join(" ");
    mask(&format!(
        "FLOAT diagnostics\n\
         Version: {} ({channel})\n\
         Windows: {}\n\
         Displays: {monitors}\n\
         Shortcuts: {shortcuts}\n\
         {ui}\n\
         \n--- Recent log ---\n{}\n",
        env!("CARGO_PKG_VERSION"),
        windows_version(),
        recent_log()
    ))
}

/// Open the folder with the log files.
#[tauri::command]
pub fn reveal_logs() -> Result<(), String> {
    let path = LOG_PATH.get().ok_or("no log yet")?;
    let dir = path.parent().ok_or("no log folder")?;
    std::process::Command::new("explorer").arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Log an error from native code: `elog!("[TAG] what failed: {}", e)`.
#[macro_export]
macro_rules! elog {
    ($($arg:tt)*) => {
        $crate::diag::write("ERROR", &format!($($arg)*))
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_the_user_name() {
        if let Ok(user) = std::env::var("USERNAME") {
            let path = format!("C:\\Users\\{user}\\AppData");
            assert_eq!(mask(&path), "C:\\Users\\%USERNAME%\\AppData");
        }
    }
}
