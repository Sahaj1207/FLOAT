use serde::Serialize;

#[derive(Clone, Serialize, Debug, PartialEq)]
pub struct FocusPresencePayload {
    pub status: String, // "normal" | "active" | "unknown"
}

/// Point-in-time Focus Assist / quiet hours state. Changes are pushed as
/// `focus-presence` events by the window monitor thread.
#[tauri::command]
pub fn get_focus_presence() -> FocusPresencePayload {
    FocusPresencePayload {
        status: crate::window::current_focus_status().to_string(),
    }
}
