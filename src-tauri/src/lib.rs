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
mod backdrop;
mod brightness;
mod calendar;
mod clipboard;
mod connectivity;
mod downloads;
mod focus;
mod lyrics;
mod media;
mod micmute;
mod notifications;
mod search;
mod shelf;
mod sysmon;
mod sysstats;
mod textgrab;
mod tray;
mod updater;
mod visualizer;
mod volume;
mod weather;
mod window;

#[tauri::command]
fn log_from_js(msg: String) {
    dlog!("[JS LOG] {}", msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just opens the island.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // `float.exe --copy-text` starts Copy Text (for custom shortcuts).
            if args.iter().any(|a| a == "--copy-text") {
                textgrab::start(app);
            } else {
                tray::command_island(app, tray::IslandCommand::Open);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tray::global_shortcut_plugin())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            window::set_hit_regions,
            window::set_hide_in_fullscreen,
            window::reset_window_position,
            window::get_island_attached,
            backdrop::set_backdrop,
            window::island_drag_started,
            autostart::get_autostart,
            autostart::set_autostart,
            tray::get_hotkey,
            tray::get_search_hotkey,
            tray::get_text_hotkey,
            tray::get_mic_hotkey,
            micmute::toggle_mic_mute,
            micmute::get_mic_muted,
            textgrab::textgrab_start,
            textgrab::textgrab_image,
            textgrab::textgrab_recognize,
            textgrab::textgrab_cancel,
            search::search,
            search::search_ready,
            search::search_open,
            search::search_icon,
            downloads::set_download_alerts,
            downloads::open_download,
            updater::check_for_update,
            updater::install_update,
            visualizer::set_visualizer_active,
            volume::get_volume,
            volume::change_volume,
            volume::set_volume,
            volume::toggle_mute,
            sysmon::get_privacy_state,
            sysmon::get_power_state,
            sysstats::get_system_stats,
            weather::get_weather,
            calendar::get_calendar_events,
            connectivity::get_connectivity,
            connectivity::set_radio,
            connectivity::open_settings_page,
            connectivity::wifi_networks,
            connectivity::wifi_connect,
            connectivity::bluetooth_devices,
            clipboard::get_clipboard_history,
            clipboard::copy_clipboard_entry,
            clipboard::remove_clipboard_entry,
            clipboard::clear_clipboard_history,
            clipboard::set_clipboard_history_enabled,
            lyrics::get_lyrics,
            brightness::get_brightness,
            brightness::set_brightness,
            shelf::get_shelf,
            shelf::add_to_shelf,
            shelf::remove_from_shelf,
            shelf::clear_shelf,
            shelf::open_shelf_item,
            shelf::get_shelf_thumbnail,
            shelf::shelf_drag_icon,
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
            shelf::init(app);
            search::init();
            downloads::init(app);
            if let Err(e) = window::init(app) {
                eprintln!("Failed to init window: {}", e);
            }
            if let Err(e) = tray::init(app) {
                eprintln!("Failed to init tray: {}", e);
            }
            if let Err(e) = sysmon::init(app) {
                eprintln!("Failed to init system monitor: {}", e);
            }
            if let Err(e) = brightness::init(app) {
                eprintln!("Failed to init brightness: {}", e);
            }
            if let Err(e) = clipboard::init(app) {
                eprintln!("Failed to init clipboard history: {}", e);
            }
            if let Err(e) = connectivity::init(app) {
                eprintln!("Failed to init connectivity: {}", e);
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
