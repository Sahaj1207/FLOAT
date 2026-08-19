use tauri::{Manager, PhysicalPosition, LogicalSize, Size};

/// Position the main window at the top-center of the primary monitor.
///
/// This is isolated into its own function so that dedicated
/// multi-monitor / positioning support can replace it later.
fn position_window_top_center(app: &tauri::App) {
    println!("[WINDOW DEBUG] FLOAT process started");
    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => {
            println!("[WINDOW DEBUG ERROR] Main window not found during setup");
            return;
        }
    };

    println!("[WINDOW DEBUG] Initializing window position...");
    println!("[WINDOW DEBUG] is_visible: {:?}", window.is_visible().unwrap_or(false));
    println!("[WINDOW DEBUG] is_minimized: {:?}", window.is_minimized().unwrap_or(false));

    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        println!("[WINDOW DEBUG] Monitor position: {:?}", monitor_pos);
        println!("[WINDOW DEBUG] Monitor size: {:?}", monitor_size);

        let window_size = window.inner_size().unwrap_or_default();
        println!("[WINDOW DEBUG] Window size: {:?}", window_size);

        let x = monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32) / 2;
        let y = monitor_pos.y + 8; // Small offset from the very top edge
        println!("[WINDOW DEBUG] Calculated physical position: ({}, {})", x, y);

        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        println!("[WINDOW DEBUG] Window position set to physical ({}, {})", x, y);
    } else {
        println!("[WINDOW DEBUG WARNING] No monitor detected during setup");
    }

    // Force visibility and focus
    let _ = window.show();
    let _ = window.set_focus();
    println!("[WINDOW DEBUG] Forced window show and focus");
}

#[tauri::command]
fn sync_window_size(app: tauri::AppHandle, width: f64, height: f64) {
    println!("[WINDOW DEBUG] sync_window_size requested: {}x{}", width, height);
    if let Some(window) = app.get_webview_window("main") {
        let current_pos = window.outer_position().unwrap_or_default();
        let current_size = window.outer_size().unwrap_or_default();

        let center_x = current_pos.x + (current_size.width as i32) / 2;
        let center_y = current_pos.y + (current_size.height as i32) / 2;

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let new_phys_w = (width * scale_factor) as i32;
        let new_phys_h = (height * scale_factor) as i32;

        let mut target_x = center_x - new_phys_w / 2;
        let mut target_y = center_y - new_phys_h / 2;

        if let Ok(Some(monitor)) = window.current_monitor() {
            let monitor_pos = monitor.position();
            let monitor_size = monitor.size();

            let min_x = monitor_pos.x;
            let max_x = monitor_pos.x + monitor_size.width as i32 - new_phys_w;
            let min_y = monitor_pos.y;
            let max_y = monitor_pos.y + monitor_size.height as i32 - new_phys_h;

            target_x = target_x.clamp(min_x, max_x.max(min_x));
            target_y = target_y.clamp(min_y, max_y.max(min_y));
        }

        let _ = window.set_size(Size::Logical(LogicalSize { width, height }));
        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
            x: target_x,
            y: target_y,
        }));
        println!(
            "[WINDOW DEBUG] Window center-preserved position: ({}, {}) for size {}x{}",
            target_x, target_y, width, height
        );
        let _ = window.show();
    } else {
        println!("[WINDOW DEBUG ERROR] Main window not found during sync_window_size");
    }
}

#[tauri::command]
fn log_from_js(msg: String) {
    println!("[JS LOG] {}", msg);
}

mod media;
mod notifications;
mod focus;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            sync_window_size,
            log_from_js,
            media::media_play_pause,
            media::media_next,
            media::media_prev,
            media::media_seek,
            media::get_multi_session_state,
            media::select_media_session,
            focus::get_focus_presence,
            notifications::remove_notification,
            notifications::clear_all_notifications,
            notifications::get_active_notifications
        ])
        .setup(|app| {
            position_window_top_center(app);
            if let Err(e) = media::init(app) {
                eprintln!("Failed to init media: {}", e);
            }
            if let Err(e) = notifications::init(app) {
                eprintln!("Failed to init notifications: {}", e);
            }
            if let Err(e) = focus::init(app) {
                eprintln!("Failed to init focus: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
