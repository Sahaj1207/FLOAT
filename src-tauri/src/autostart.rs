//! Launch at startup.
//!
//! MSIX installs must use the manifest's StartupTask (registry Run keys are
//! virtualized inside the package); unpackaged builds use the HKCU Run key.

use tauri::{AppHandle, Emitter};
use windows::ApplicationModel::{Package, StartupTask, StartupTaskState};
use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ,
};

const RUN_KEY: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
const RUN_VALUE: PCWSTR = w!("FLOAT");
/// Must match the TaskId in the MSIX manifest (scripts/package-msix.ps1).
const STARTUP_TASK_ID: &str = "FLOATStartup";

fn is_packaged() -> bool {
    Package::Current().is_ok()
}

async fn startup_task() -> windows::core::Result<StartupTask> {
    StartupTask::GetAsync(&HSTRING::from(STARTUP_TASK_ID))?.await
}

pub async fn is_enabled() -> bool {
    if is_packaged() {
        match startup_task().await.and_then(|t| t.State()) {
            Ok(state) => state == StartupTaskState::Enabled || state == StartupTaskState::EnabledByPolicy,
            Err(_) => false,
        }
    } else {
        let status = unsafe {
            RegGetValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE, RRF_RT_REG_SZ, None, None, None)
        };
        status == ERROR_SUCCESS
    }
}

/// Enable or disable launch at startup. Returns the resulting state, which
/// can differ from the request (e.g. the user disabled FLOAT in Task Manager).
pub async fn set_enabled(enabled: bool) -> bool {
    if is_packaged() {
        if let Ok(task) = startup_task().await {
            if enabled {
                if let Ok(op) = task.RequestEnableAsync() {
                    let _ = op.await;
                }
            } else {
                let _ = task.Disable();
            }
        }
    } else if enabled {
        if let Ok(exe) = std::env::current_exe() {
            let command: Vec<u16> = format!("\"{}\"", exe.display())
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            unsafe {
                RegSetKeyValueW(
                    HKEY_CURRENT_USER,
                    RUN_KEY,
                    RUN_VALUE,
                    REG_SZ.0,
                    Some(command.as_ptr().cast()),
                    (command.len() * 2) as u32,
                );
            }
        }
    } else {
        unsafe {
            RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE);
        }
    }
    is_enabled().await
}

#[tauri::command]
pub async fn get_autostart() -> bool {
    is_enabled().await
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> bool {
    let state = set_enabled(enabled).await;
    crate::tray::sync_autostart(&app, state);
    let _ = app.emit("autostart-changed", state);
    state
}
