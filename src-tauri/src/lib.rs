/// Debug-only logging. Compiles to nothing in release builds so the
/// shipped app does not pay for formatting or stdout writes.
macro_rules! dlog {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!($($arg)*);
        }
    };
}

mod appicon;
mod autostart;
mod focus;
mod media;
mod notifications;
mod tray;
mod visualizer;
mod volume;
mod window;

#[tauri::command]
fn log_from_js(msg: String) {
    dlog!("[JS LOG] {}", msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just opens the island.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::command_island(app, tray::IslandCommand::Open);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tray::global_shortcut_plugin())
        .invoke_handler(tauri::generate_handler![
            window::set_hit_regions,
            window::set_hide_in_fullscreen,
            window::reset_window_position,
            autostart::get_autostart,
            autostart::set_autostart,
            tray::get_hotkey,
            visualizer::set_visualizer_active,
            volume::get_volume,
            volume::change_volume,
            volume::toggle_mute,
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
            notifications::get_active_notifications,
            appicon::get_app_icon
        ])
        .setup(|app| {
            if let Err(e) = window::init(app) {
                eprintln!("Failed to init window: {}", e);
            }
            if let Err(e) = tray::init(app) {
                eprintln!("Failed to init tray: {}", e);
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
