//! Copy Text from Anything, after Apple's Live Text: freeze the screen under
//! the cursor, let the user drag a box over it, read the text inside with
//! Windows' built-in OCR (Windows.Media.Ocr, on-device) and copy it.
//!
//! The screen is captured *before* the selection window appears, so the
//! window can show that still image, and what you select is exactly what
//! was on screen, even a paused video frame.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Security::Cryptography::CryptographicBuffer;
use windows::Win32::Foundation::POINT;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, GetMonitorInfoW,
    MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, MONITORINFO,
    MONITOR_DEFAULTTONEAREST, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

const LABEL: &str = "textgrab";

struct Capture {
    /// Monitor rectangle in physical screen pixels.
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    /// Top-down BGRA.
    bgra: Vec<u8>,
}

static CAPTURE: Mutex<Option<Capture>> = Mutex::new(None);

#[derive(Clone, Serialize)]
pub struct GrabbedPayload {
    text: String,
    lines: usize,
}

/// Screenshot of the monitor the cursor is on.
fn capture_monitor() -> Option<Capture> {
    unsafe {
        let mut cursor = POINT::default();
        if !GetCursorPos(&mut cursor).as_bool() {
            return None;
        }
        let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        let r = info.rcMonitor;
        let (w, h) = (r.right - r.left, r.bottom - r.top);

        let screen = GetDC(None);
        let mem = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(mem, bmp);
        let copied = BitBlt(mem, 0, 0, w, h, screen, r.left, r.top, SRCCOPY).as_bool();
        SelectObject(mem, old);

        let mut header = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bgra = vec![0u8; (w * h * 4) as usize];
        let lines = GetDIBits(mem, bmp, 0, h as u32, Some(bgra.as_mut_ptr().cast()), &mut header, DIB_RGB_COLORS);
        DeleteObject(bmp);
        DeleteDC(mem);
        ReleaseDC(None, screen);
        if !copied || lines == 0 {
            return None;
        }
        // Screen pixels carry no alpha; make them opaque.
        for px in bgra.chunks_exact_mut(4) {
            px[3] = 255;
        }
        Some(Capture { x: r.left, y: r.top, width: w, height: h, bgra })
    }
}

/// Freeze the screen and open the selection overlay over it.
pub fn start(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_some() {
        return;
    }
    let Some(capture) = capture_monitor() else {
        crate::elog!("[TEXTGRAB] screen capture failed");
        return;
    };
    let (x, y, w, h) = (capture.x, capture.y, capture.width, capture.height);
    *CAPTURE.lock().unwrap() = Some(capture);

    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#textgrab".into()))
        .title("Copy Text")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(true)
        .build();
    match window {
        Ok(window) => {
            let _ = window.set_position(PhysicalPosition::new(x, y));
            let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
            // Shown by the page once the still image is painted, so there's no flash.
        }
        Err(e) => crate::elog!("[TEXTGRAB] window failed: {e}"),
    }
}

// Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn textgrab_start(app: AppHandle) {
    start(&app);
}

/// The frozen screen as PNG (base64), and its size in physical pixels.
#[tauri::command]
pub async fn textgrab_image() -> Option<(String, i32, i32)> {
    tauri::async_runtime::spawn_blocking(|| {
        let guard = CAPTURE.lock().ok()?;
        let c = guard.as_ref()?;
        let mut rgba = c.bgra.clone();
        for px in rgba.chunks_exact_mut(4) {
            px.swap(0, 2);
        }
        let mut out = Vec::new();
        let mut encoder = png::Encoder::new(&mut out, c.width as u32, c.height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        encoder.write_header().ok()?.write_image_data(&rgba).ok()?;
        Some((STANDARD.encode(out), c.width, c.height))
    })
    .await
    .ok()
    .flatten()
}

/// Crop to the selection, scaling small text up so OCR can read it.
fn crop(c: &Capture, x: i32, y: i32, w: i32, h: i32) -> Option<(Vec<u8>, i32, i32)> {
    let x = x.clamp(0, c.width - 1);
    let y = y.clamp(0, c.height - 1);
    let w = w.min(c.width - x);
    let h = h.min(c.height - y);
    if w < 4 || h < 4 {
        return None;
    }
    // OCR wants text at least ~20 px tall; a short selection is likely one line.
    let scale = if h < 60 { 3 } else if h < 160 { 2 } else { 1 };
    let max = OcrEngine::MaxImageDimension().unwrap_or(10_000) as i32;
    let scale = scale.min((max / w.max(h)).max(1));
    let (ow, oh) = (w * scale, h * scale);
    let mut out = vec![0u8; (ow * oh * 4) as usize];
    for oy in 0..oh {
        for ox in 0..ow {
            let src = (((y + oy / scale) * c.width + (x + ox / scale)) * 4) as usize;
            let dst = ((oy * ow + ox) * 4) as usize;
            out[dst..dst + 4].copy_from_slice(&c.bgra[src..src + 4]);
        }
    }
    Some((out, ow, oh))
}

fn recognize(bgra: &[u8], w: i32, h: i32) -> windows::core::Result<Vec<String>> {
    let buffer = CryptographicBuffer::CreateFromByteArray(bgra)?;
    let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&buffer, BitmapPixelFormat::Bgra8, w, h, BitmapAlphaMode::Premultiplied)?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
    let result = engine.RecognizeAsync(&bitmap)?.get()?;
    let mut lines = Vec::new();
    for line in result.Lines()? {
        let text = line.Text()?.to_string();
        if !text.trim().is_empty() {
            lines.push(text);
        }
    }
    Ok(lines)
}

fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
    *CAPTURE.lock().unwrap() = None;
}

/// Read the text in the selection (physical px within the capture), copy
/// it, tell the island, and close the overlay.
#[tauri::command]
pub async fn textgrab_recognize(app: AppHandle, x: i32, y: i32, width: i32, height: i32) -> Result<usize, String> {
    let cropped = {
        let guard = CAPTURE.lock().map_err(|e| e.to_string())?;
        let c = guard.as_ref().ok_or("nothing captured")?;
        crop(c, x, y, width, height).ok_or("selection too small")?
    };
    let lines = tauri::async_runtime::spawn_blocking(move || recognize(&cropped.0, cropped.1, cropped.2))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Text recognition isn't available: {e}"))?;
    close(&app);
    let text = lines.join("\n");
    if !text.is_empty() {
        crate::clipboard::copy_text(&text)?;
    }
    let _ = app.emit("text-grabbed", GrabbedPayload { lines: lines.len(), text });
    Ok(lines.len())
}

#[tauri::command]
pub fn textgrab_cancel(app: AppHandle) {
    close(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs Windows OCR on a rendered word. Needs an OCR language pack, which
    /// Windows installs with the display language.
    #[test]
    fn engine_is_available() {
        assert!(OcrEngine::TryCreateFromUserProfileLanguages().is_ok());
    }

    /// Draws a line of text with GDI and reads it back through the same
    /// crop + OCR path the overlay uses.
    #[test]
    fn reads_rendered_text() {
        use windows::core::HSTRING;
        use windows::Win32::Graphics::Gdi::{
            CreateFontW, PatBlt, SetBkColor, SetTextColor, TextOutW, WHITENESS, FW_NORMAL, CLIP_DEFAULT_PRECIS,
            OUT_DEFAULT_PRECIS, DEFAULT_CHARSET, CLEARTYPE_QUALITY, DEFAULT_PITCH, FF_DONTCARE,
        };
        use windows::Win32::Foundation::COLORREF;
        let (w, h) = (900, 120);
        let text = "Hello FLOAT 2026";
        let bgra = unsafe {
            let screen = GetDC(None);
            let dc = CreateCompatibleDC(screen);
            let bmp = CreateCompatibleBitmap(screen, w, h);
            SelectObject(dc, bmp);
            PatBlt(dc, 0, 0, w, h, WHITENESS);
            let font = CreateFontW(64, 0, 0, 0, FW_NORMAL.0 as i32, 0, 0, 0, DEFAULT_CHARSET.0 as u32, OUT_DEFAULT_PRECIS.0 as u32,
                CLIP_DEFAULT_PRECIS.0 as u32, CLEARTYPE_QUALITY.0 as u32, (DEFAULT_PITCH.0 | FF_DONTCARE.0) as u32, &HSTRING::from("Segoe UI"));
            SelectObject(dc, font);
            SetTextColor(dc, COLORREF(0));
            SetBkColor(dc, COLORREF(0xFFFFFF));
            let wide: Vec<u16> = text.encode_utf16().collect();
            TextOutW(dc, 20, 20, &wide);
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0 as u32,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut px = vec![0u8; (w * h * 4) as usize];
            GetDIBits(dc, bmp, 0, h as u32, Some(px.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
            DeleteObject(font);
            DeleteObject(bmp);
            DeleteDC(dc);
            ReleaseDC(None, screen);
            px.chunks_exact_mut(4).for_each(|p| p[3] = 255);
            px
        };
        let capture = Capture { x: 0, y: 0, width: w, height: h, bgra };
        let (px, cw, ch) = crop(&capture, 0, 0, w, h).unwrap();
        let lines = recognize(&px, cw, ch).expect("ocr");
        assert_eq!(lines.join(" "), text);
    }

    #[test]
    fn crops_and_scales_small_selections() {
        let c = Capture { x: 0, y: 0, width: 10, height: 10, bgra: (0..400).map(|i| i as u8).collect() };
        let (px, w, h) = crop(&c, 2, 3, 5, 4).unwrap();
        assert_eq!((w, h), (15, 12)); // 3x for a short selection
        // Top-left output pixel is source pixel (2, 3).
        assert_eq!(&px[0..4], &c.bgra[((3 * 10 + 2) * 4) as usize..((3 * 10 + 2) * 4 + 4) as usize]);
        assert!(crop(&c, 0, 0, 2, 2).is_none());
    }
}
