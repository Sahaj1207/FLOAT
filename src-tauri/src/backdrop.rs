//! Live glass backdrop.
//!
//! A web view in a transparent window cannot blur what is behind the window,
//! so real glass needs the compositor. This module owns a bare native window
//! that sits directly beneath the island and hosts a Windows.UI.Composition
//! visual painted with the host backdrop brush (the system's blurred view of
//! whatever is behind the window), clipped by an antialiased rounded
//! rectangle that follows the island's shape. The web view draws the tint,
//! highlights and content on top.
//!
//! Nothing is captured: DWM does the blur on the GPU, so it costs no CPU and
//! FLOAT still appears normally in screenshots and screen sharing.

use serde::Deserialize;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use windows::core::{w, ComInterface};
use windows::Foundation::Numerics::{Vector2, Vector3};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::{
    CreateDispatcherQueueController, DispatcherQueueOptions, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowRect, PostMessageW, RegisterClassW,
    SetWindowPos, ShowWindow, TranslateMessage, MSG, SWP_NOACTIVATE, SW_HIDE, SW_SHOWNOACTIVATE, WM_APP, WNDCLASSW,
    WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::UI::Composition::{CompositionRoundedRectangleGeometry, Compositor, SpriteVisual};

/// The island's shape in logical px, relative to the main window's top-left.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Shape {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub top_radius: f64,
    pub bottom_radius: f64,
}

static BACKDROP: AtomicIsize = AtomicIsize::new(0);
static MAIN: AtomicIsize = AtomicIsize::new(0);
static SHAPE: Mutex<Option<Shape>> = Mutex::new(None);
/// False while the island itself is hidden (fullscreen app, tray toggle).
static ISLAND_VISIBLE: AtomicBool = AtomicBool::new(true);

/// Posted to the backdrop window to re-apply SHAPE on its own thread, where
/// the composition objects live.
const WM_APPLY: u32 = WM_APP + 1;

/// Composition objects, owned by the backdrop thread.
struct Glass {
    _target: DesktopWindowTarget,
    visual: SpriteVisual,
    geometry: CompositionRoundedRectangleGeometry,
}

thread_local! {
    static GLASS: RefCell<Option<Glass>> = const { RefCell::new(None) };
}

fn create_glass(hwnd: HWND) -> windows::core::Result<Glass> {
    let compositor = Compositor::new()?;
    let target = unsafe { compositor.cast::<ICompositorDesktopInterop>()?.CreateDesktopWindowTarget(hwnd, false)? };
    let visual = compositor.CreateSpriteVisual()?;
    visual.SetBrush(&compositor.CreateHostBackdropBrush()?)?;
    let geometry = compositor.CreateRoundedRectangleGeometry()?;
    visual.SetClip(&compositor.CreateGeometricClipWithGeometry(&geometry)?)?;
    target.SetRoot(&visual)?;
    Ok(Glass { _target: target, visual, geometry })
}

/// Runs on the backdrop thread: place the window under the island and shape
/// the blurred visual, or hide it.
unsafe fn apply_on_thread(backdrop: HWND) {
    let main = HWND(MAIN.load(Ordering::Relaxed));
    let shape = *SHAPE.lock().unwrap();
    let Some(shape) = shape.filter(|_| ISLAND_VISIBLE.load(Ordering::Relaxed)) else {
        ShowWindow(backdrop, SW_HIDE);
        return;
    };
    let mut rect = RECT::default();
    if main.0 == 0 || !GetWindowRect(main, &mut rect).as_bool() {
        return;
    }
    let scale = GetDpiForWindow(main) as f64 / 96.0;
    // Slightly inside the island so the blur never peeks past its edge.
    const INSET: f64 = 0.5;
    let x = rect.left + ((shape.x + INSET) * scale).round() as i32;
    let y = rect.top + ((shape.y + INSET) * scale).round() as i32;
    let w = ((shape.width - INSET * 2.0) * scale).round();
    let h = ((shape.height - INSET * 2.0) * scale).round();
    if w < 2.0 || h < 2.0 {
        ShowWindow(backdrop, SW_HIDE);
        return;
    }

    GLASS.with(|glass| {
        if let Some(glass) = glass.borrow().as_ref() {
            // One rounded rectangle with the bottom radius. A square top
            // (the docked notch) is made by extending the rectangle above the
            // window, so its top corners are cut off by the window edge.
            let radius = (shape.bottom_radius * scale).min(w / 2.0).max(0.0) as f32;
            let lift = if shape.top_radius < 0.5 { radius } else { 0.0 };
            let _ = glass.visual.SetSize(Vector2 { X: w as f32, Y: h as f32 });
            let _ = glass.geometry.SetOffset(Vector2 { X: 0.0, Y: -lift });
            let _ = glass.geometry.SetSize(Vector2 { X: w as f32, Y: h as f32 + lift });
            let _ = glass.geometry.SetCornerRadius(Vector2 { X: radius, Y: radius });
            let _ = glass.visual.SetOffset(Vector3 { X: 0.0, Y: 0.0, Z: 0.0 });
        }
    });
    // Directly beneath the island window in z-order.
    SetWindowPos(backdrop, main, x, y, w as i32, h as i32, SWP_NOACTIVATE);
    ShowWindow(backdrop, SW_SHOWNOACTIVATE);
}

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_APPLY {
        apply_on_thread(hwnd);
        return LRESULT(0);
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// Ask the backdrop thread to re-apply the current shape.
fn apply() {
    let backdrop = HWND(BACKDROP.load(Ordering::Relaxed));
    if backdrop.0 != 0 {
        unsafe {
            PostMessageW(backdrop, WM_APPLY, WPARAM(0), LPARAM(0));
        }
    }
}

/// Follow the island window when it moves.
pub fn on_island_moved() {
    apply();
}

pub fn set_island_visible(visible: bool) {
    ISLAND_VISIBLE.store(visible, Ordering::Relaxed);
    apply();
}

/// Set the glass shape (None = no glass, e.g. the solid notch).
#[tauri::command]
pub fn set_backdrop(shape: Option<Shape>) {
    *SHAPE.lock().unwrap() = shape;
    apply();
}

pub fn init(main_hwnd: isize) {
    MAIN.store(main_hwnd, Ordering::Relaxed);
    let _ = std::thread::Builder::new().name("backdrop".into()).spawn(|| unsafe {
        // Composition needs a DispatcherQueue on its thread.
        let options = DispatcherQueueOptions {
            dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
            threadType: DQTYPE_THREAD_CURRENT,
            apartmentType: DQTAT_COM_NONE,
        };
        let Ok(_queue) = CreateDispatcherQueueController(options) else { return };
        let Ok(instance) = GetModuleHandleW(None) else { return };
        let class = WNDCLASSW {
            lpfnWndProc: Some(wnd_proc),
            hInstance: instance.into(),
            lpszClassName: w!("FloatBackdrop"),
            ..Default::default()
        };
        RegisterClassW(&class);
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_NOREDIRECTIONBITMAP,
            w!("FloatBackdrop"),
            w!(""),
            WS_POPUP,
            0,
            0,
            1,
            1,
            None,
            None,
            instance,
            None,
        );
        if hwnd.0 == 0 {
            return;
        }
        // Lets the host backdrop brush sample what is behind this window.
        let enable = BOOL::from(true);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_HOSTBACKDROPBRUSH,
            &enable as *const _ as *const _,
            std::mem::size_of::<BOOL>() as u32,
        );
        match create_glass(hwnd) {
            Ok(glass) => GLASS.with(|g| *g.borrow_mut() = Some(glass)),
            Err(e) => {
                dlog!("[BACKDROP] composition unavailable: {:?}", e);
                return;
            }
        }
        BACKDROP.store(hwnd.0, Ordering::Relaxed);
        apply_on_thread(hwnd);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}
