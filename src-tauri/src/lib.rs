/// Debug-only logging. Compiles to nothing in release builds so the
/// shipped app does not pay for formatting or stdout writes.
macro_rules! dlog {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!($($arg)*);
        }
    };
}

mod focus;
mod media;
mod notifications;
mod window;

#[tauri::command]
fn log_from_js(msg: String) {
    dlog!("[JS LOG] {}", msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            window::set_hit_regions,
            window::set_hide_in_fullscreen,
            window::reset_window_position,
            log_from_js,
            media::media_play_pause,
            media::media_next,
            media::media_prev,
            media::media_seek,
            media::get_multi_session_state,
            media::get_album_art,
            media::select_media_session,
            focus::get_focus_presence,
            notifications::remove_notification,
            notifications::clear_all_notifications,
            notifications::get_active_notifications
        ])
        .setup(|app| {
            if let Err(e) = window::init(app) {
                eprintln!("Failed to init window: {}", e);
            }
            if let Err(e) = media::init(app) {
                eprintln!("Failed to init media: {}", e);
            }
            if let Err(e) = notifications::init(app) {
                eprintln!("Failed to init notifications: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
