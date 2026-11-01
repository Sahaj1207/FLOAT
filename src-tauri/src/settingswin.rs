//! The Settings window: a separate, Mac-style window (traffic lights,
//! translucent sidebar) loading the same frontend at `#settings`.
//!
//! On Windows 11 the window gets Mica, so the sidebar picks up the desktop
//! colours like macOS's vibrancy; on Windows 10 it's a solid window.

use tauri::window::{Effect, EffectsBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use windows::core::HSTRING;
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND};
use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

const LABEL: &str = "settings";

/// Windows build number (22000+ is Windows 11).
pub fn windows_build() -> u32 {
    let mut buf = [0u16; 32];
    let mut size = (buf.len() * 2) as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            &HSTRING::from(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"),
            &HSTRING::from("CurrentBuildNumber"),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if status.is_err() {
        return 0;
    }
    String::from_utf16_lossy(&buf[..(size as usize / 2).saturating_sub(1)]).parse().unwrap_or(0)
}

/// Open Settings (or bring it forward), optionally at a section like
/// "updates" or "keyboard".
pub fn open(app: &AppHandle, section: Option<&str>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(section) = section {
            let _ = window.emit("settings-section", section);
        }
        return;
    }
    let mica = windows_build() >= 22000;
    let url = format!("index.html?material={}#settings/{}", if mica { "mica" } else { "solid" }, section.unwrap_or(""));
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title("FLOAT Settings")
        .inner_size(860.0, 580.0)
        .min_inner_size(720.0, 480.0)
        .center()
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .visible(false);
    if mica {
        builder = builder.transparent(true).effects(EffectsBuilder::new().effect(Effect::Mica).build());
    }
    match builder.build() {
        Ok(window) => {
            // Windows 11 rounds undecorated windows only when asked.
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    let pref = DWMWCP_ROUND;
                    let _ = DwmSetWindowAttribute(
                        windows::Win32::Foundation::HWND(hwnd.0 as isize),
                        DWMWA_WINDOW_CORNER_PREFERENCE,
                        &pref as *const _ as *const _,
                        std::mem::size_of_val(&pref) as u32,
                    );
                }
            }
            // The page shows itself once painted, so nothing flashes.
        }
        Err(e) => crate::elog!("[SETTINGS] window failed: {e}"),
    }
}

/// Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle, section: Option<String>) {
    open(&app, section.as_deref());
}
