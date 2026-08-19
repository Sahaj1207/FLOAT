use tauri::{AppHandle, Emitter};
use serde::Serialize;
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_BUSY,
    QUNS_PRESENTATION_MODE, QUNS_QUIET_TIME, QUNS_RUNNING_D3D_FULL_SCREEN,
};

#[derive(Clone, Serialize, Debug, PartialEq)]
pub struct FocusPresencePayload {
    pub status: String, // "normal" | "active" | "unknown"
}

/// Query the point-in-time Windows User Notification / Focus / Quiet Hours state.
pub fn query_focus_state() -> FocusPresencePayload {
    unsafe {
        match SHQueryUserNotificationState() {
            Ok(state) => {
                let status = match state {
                    QUNS_ACCEPTS_NOTIFICATIONS => "normal",
                    QUNS_QUIET_TIME | QUNS_BUSY | QUNS_PRESENTATION_MODE | QUNS_RUNNING_D3D_FULL_SCREEN => "active",
                    _ => "unknown",
                };
                FocusPresencePayload {
                    status: status.to_string(),
                }
            }
            Err(e) => {
                eprintln!("[FOCUS] SHQueryUserNotificationState query failed: {:?}", e);
                FocusPresencePayload {
                    status: "unknown".to_string(),
                }
            }
        }
    }
}

/// Emit focus presence to frontend if changed or during startup.
pub fn emit_focus_presence(app: &AppHandle) {
    let payload = query_focus_state();
    println!("[FOCUS] Evaluated focus presence state: {:?}", payload.status);
    let _ = app.emit("focus-presence", payload);
}

#[tauri::command]
pub fn get_focus_presence() -> FocusPresencePayload {
    query_focus_state()
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();

    // Initial evaluation at startup
    emit_focus_presence(&app_handle);

    Ok(())
}
