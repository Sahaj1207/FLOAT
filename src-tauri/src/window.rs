//! Island window management.
//!
//! The island lives in one fixed-size transparent window. The frontend animates
//! the island freely inside it and reports the island's shape as hit regions;
//! a monitor thread makes the window click-through everywhere outside those
//! regions, so the empty transparent area never blocks apps underneath.
//!
//! The same thread polls Focus Assist / fullscreen state and persists the
//! window position after the user drags the island.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowRect,
};

/// Logical size of the island window. Large enough for the expanded panel
/// plus a split bubble beside the widest notch. Keep WINDOW_WIDTH in sync
/// with FloatShell.tsx.
pub const WINDOW_WIDTH: f64 = 720.0;
pub const WINDOW_HEIGHT: f64 = 400.0;

const TICK: Duration = Duration::from_millis(16);
const SYSTEM_POLL_EVERY: u32 = 30; // ticks (~500ms)
/// How long after the last move (with the mouse button up) a drag counts as over.
const SETTLE_AFTER_MOVE: Duration = Duration::from_millis(60);
/// Dropping the island's top within this many logical px of the screen's top
/// edge attaches it there as the notch.
const ATTACH_DISTANCE: f64 = 28.0;
/// Attached drops within this many logical px of center snap onto it.
const CENTER_SNAP: f64 = 72.0;

/// A rectangle in logical px, relative to the window's top-left corner.
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Default)]
pub struct WindowState {
    regions: Mutex<Vec<HitRect>>,
    hide_in_fullscreen: AtomicBool,
    /// Hidden from the tray menu; overrides fullscreen-based visibility.
    user_hidden: AtomicBool,
    moved_at: Mutex<Option<Instant>>,
    /// The island is flush with the top edge (notch) rather than floating.
    attached: AtomicBool,
}

#[derive(Clone, Serialize, Debug, PartialEq)]
struct HoverPayload {
    inside: bool,
}

/// The island's horizontal center and the window's top, in physical px.
/// Storing the center keeps the island in place if the window size changes.
#[derive(Serialize, Deserialize)]
struct SavedPosition {
    center_x: i32,
    y: i32,
}

/// Physical window width, from the fixed logical size and the DPI scale.
fn physical_width(app: &AppHandle) -> i32 {
    let scale = app
        .get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);
    (WINDOW_WIDTH * scale).round() as i32
}

#[derive(Clone, Copy, PartialEq, Debug)]
struct SystemState {
    focus: &'static str,
    fullscreen: bool,
}

fn query_system_state() -> SystemState {
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_APP, QUNS_BUSY,
        QUNS_PRESENTATION_MODE, QUNS_QUIET_TIME, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    let state = unsafe { SHQueryUserNotificationState() };
    let (focus, fullscreen) = match state {
        Ok(QUNS_ACCEPTS_NOTIFICATIONS) | Ok(QUNS_APP) => ("normal", false),
        Ok(QUNS_QUIET_TIME) => ("active", false),
        Ok(QUNS_BUSY) | Ok(QUNS_RUNNING_D3D_FULL_SCREEN) | Ok(QUNS_PRESENTATION_MODE) => {
            ("active", !foreground_is_desktop())
        }
        _ => ("unknown", false),
    };
    SystemState { focus, fullscreen }
}

/// The desktop (Progman/WorkerW) covers the whole monitor and can read as a
/// fullscreen app; it must never hide the island.
fn foreground_is_desktop() -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut buf = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut buf);
        let class = String::from_utf16_lossy(&buf[..len.max(0) as usize]);
        class == "Progman" || class == "WorkerW"
    }
}

pub fn current_focus_status() -> &'static str {
    query_system_state().focus
}

fn position_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("window-position.json"))
}

fn load_position(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let text = std::fs::read_to_string(position_file(app)?).ok()?;
    let saved: SavedPosition = serde_json::from_str(&text).ok()?;
    // Only restore onto a monitor that still exists.
    let on_screen = app.available_monitors().ok()?.iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        saved.center_x >= p.x
            && saved.center_x < p.x + s.width as i32
            && saved.y >= p.y - 16
            && saved.y < p.y + s.height as i32
    });
    on_screen.then_some(PhysicalPosition::new(saved.center_x - physical_width(app) / 2, saved.y))
}

fn save_position(app: &AppHandle, pos: PhysicalPosition<i32>) {
    let Some(path) = position_file(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let saved = SavedPosition { center_x: pos.x + physical_width(app) / 2, y: pos.y };
    if let Ok(text) = serde_json::to_string(&saved) {
        let _ = std::fs::write(path, text);
    }
}

/// Top-center position on the monitor the window is currently on.
fn top_center(window: &tauri::WebviewWindow) -> Option<PhysicalPosition<i32>> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let size = window.outer_size().ok()?;
    let (mp, ms) = (monitor.position(), monitor.size());
    Some(PhysicalPosition::new(
        mp.x + (ms.width as i32 - size.width as i32) / 2,
        mp.y,
    ))
}

fn set_attached(app: &AppHandle, attached: bool) {
    app.state::<WindowState>().attached.store(attached, Ordering::Relaxed);
    let _ = app.emit("island-attached", attached);
}

pub fn reset_position(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Some(pos) = top_center(&window) {
            let _ = window.set_position(pos);
            save_position(app, pos);
            set_attached(app, true);
        }
    }
}

/// Whether a window at `pos` sits flush with the top edge of its monitor.
fn is_at_top(window: &tauri::WebviewWindow, pos: PhysicalPosition<i32>) -> bool {
    window
        .current_monitor()
        .ok()
        .flatten()
        .is_some_and(|m| pos.y == m.position().y)
}

/// After a drag ends: attach to the top edge if dropped near it (snapping to
/// center when close), otherwise float where dropped, kept fully on screen.
fn settle_after_move(app: &AppHandle, window: &tauri::WebviewWindow) {
    let (Ok(mut pos), Ok(size), Ok(Some(monitor))) =
        (window.outer_position(), window.outer_size(), window.current_monitor())
    else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let (mp, ms) = (monitor.position(), monitor.size());
    let center_x = mp.x + (ms.width as i32 - size.width as i32) / 2;

    let attached = ((pos.y - mp.y) as f64) < ATTACH_DISTANCE * scale;
    if attached {
        pos.y = mp.y;
        if ((pos.x - center_x) as f64).abs() < CENTER_SNAP * scale {
            pos.x = center_x;
        }
    }
    // The island is centered in a wider transparent window; let that margin
    // hang off the sides, but keep the island itself and the panel on screen.
    let margin = size.width as i32 / 3;
    pos.x = pos.x.clamp(mp.x - margin, mp.x + ms.width as i32 - size.width as i32 + margin);
    pos.y = pos.y.clamp(mp.y, (mp.y + ms.height as i32 - size.height as i32).max(mp.y));

    if window.outer_position().ok() != Some(pos) {
        let _ = window.set_position(pos);
    }
    save_position(app, pos);
    set_attached(app, attached);
}

#[tauri::command]
pub fn get_island_attached(state: tauri::State<'_, WindowState>) -> bool {
    state.attached.load(Ordering::Relaxed)
}

/// The frontend calls this when a drag starts, so a drag that never moves
/// the window still settles (and re-reports the attached state).
#[tauri::command]
pub fn island_drag_started(state: tauri::State<'_, WindowState>) {
    *state.moved_at.lock().unwrap() = Some(Instant::now());
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let window = app
        .get_webview_window("main")
        .ok_or("main window not found")?;

    let state = WindowState::default();
    state.hide_in_fullscreen.store(true, Ordering::Relaxed);
    app.manage(state);

    let _ = window.set_size(tauri::LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT));
    let pos = load_position(&handle).or_else(|| top_center(&window));
    if let Some(pos) = pos {
        let _ = window.set_position(pos);
    }
    if let Ok(pos) = window.outer_position() {
        let attached = is_at_top(&window, pos);
        handle.state::<WindowState>().attached.store(attached, Ordering::Relaxed);
    }
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.show();

    let moved_handle = handle.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(_) = event {
            let state = moved_handle.state::<WindowState>();
            *state.moved_at.lock().unwrap() = Some(Instant::now());
            crate::backdrop::on_island_moved();
        }
    });

    // HWND as a plain integer so the monitor thread can own it.
    let hwnd = window.hwnd()?.0 as isize;
    crate::backdrop::init(hwnd);
    std::thread::Builder::new()
        .name("island-monitor".into())
        .spawn(move || monitor_loop(handle, hwnd))?;
    Ok(())
}

fn monitor_loop(app: AppHandle, hwnd: isize) {
    let Some(window) = app.get_webview_window("main") else { return };
    let hwnd = HWND(hwnd);
    let mut inside = false;
    let mut system: Option<SystemState> = None;
    let mut hidden = false;
    let mut tick: u32 = 0;

    loop {
        std::thread::sleep(TICK);
        tick = tick.wrapping_add(1);
        let state = app.state::<WindowState>();

        // --- Click-through hit testing -----------------------------------
        let mut cursor = POINT::default();
        let mut rect = RECT::default();
        let now_inside = unsafe {
            GetCursorPos(&mut cursor).as_bool() && GetWindowRect(hwnd, &mut rect).as_bool()
        } && {
            let scale = unsafe { GetDpiForWindow(hwnd) } as f64 / 96.0;
            let lx = (cursor.x - rect.left) as f64 / scale;
            let ly = (cursor.y - rect.top) as f64 / scale;
            state.regions.lock().unwrap().iter().any(|r| {
                lx >= r.x && lx <= r.x + r.width && ly >= r.y && ly <= r.y + r.height
            })
        };
        if now_inside != inside && !hidden {
            inside = now_inside;
            let _ = window.set_ignore_cursor_events(!inside);
            let _ = app.emit("island-hover", HoverPayload { inside });
        }

        // --- Settle once a drag has ended (button up, no recent movement) ----
        let button_down = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0;
        let settled = {
            let mut moved = state.moved_at.lock().unwrap();
            match *moved {
                Some(t) if !button_down && t.elapsed() >= SETTLE_AFTER_MOVE => {
                    *moved = None;
                    true
                }
                _ => false,
            }
        };
        if settled {
            settle_after_move(&app, &window);
        }

        // --- Focus Assist / fullscreen -------------------------------------
        if tick % SYSTEM_POLL_EVERY == 0 {
            let next = query_system_state();
            if system.map(|s| s.focus) != Some(next.focus) {
                dlog!("[WINDOW] focus status -> {}", next.focus);
                let _ = app.emit(
                    "focus-presence",
                    crate::focus::FocusPresencePayload {
                        status: next.focus.to_string(),
                    },
                );
            }
            system = Some(next);
        }

        let should_hide = state.user_hidden.load(Ordering::Relaxed)
            || (state.hide_in_fullscreen.load(Ordering::Relaxed)
                && system.map(|s| s.fullscreen).unwrap_or(false));
        if should_hide != hidden {
            hidden = should_hide;
            dlog!("[WINDOW] hidden -> {}", hidden);
            crate::backdrop::set_island_visible(!hidden);
            if hidden {
                let _ = window.hide();
                if inside {
                    inside = false;
                    let _ = app.emit("island-hover", HoverPayload { inside });
                }
            } else {
                let _ = window.show();
            }
        }
    }
}

pub fn set_user_hidden(app: &AppHandle, hidden: bool) {
    app.state::<WindowState>()
        .user_hidden
        .store(hidden, Ordering::Relaxed);
}

pub fn is_user_hidden(app: &AppHandle) -> bool {
    app.state::<WindowState>().user_hidden.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_hit_regions(regions: Vec<HitRect>, state: tauri::State<'_, WindowState>) {
    *state.regions.lock().unwrap() = regions;
}

#[tauri::command]
pub fn set_hide_in_fullscreen(enabled: bool, state: tauri::State<'_, WindowState>) {
    state.hide_in_fullscreen.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn reset_window_position(app: AppHandle) {
    reset_position(&app);
}
