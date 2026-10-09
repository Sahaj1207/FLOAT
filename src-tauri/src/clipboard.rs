//! Clipboard history (text and images), kept in memory only.
//!
//! Polls GetClipboardSequenceNumber, which is cheap, and reads new content
//! when it changes. Content that password managers and other apps flag as
//! private (ExcludeClipboardContentFromMonitorProcessing,
//! CanIncludeInClipboardHistory = 0) is never recorded.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use windows::core::w;
use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable,
    OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::{CF_DIB, CF_UNICODETEXT};

const POLL_EVERY: Duration = Duration::from_millis(500);
const MAX_ENTRIES: usize = 24;
const MAX_TEXT_CHARS: usize = 20_000;
const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;
const THUMB_MAX: u32 = 240;

#[derive(Clone)]
enum Content {
    Text(String),
    /// Raw CF_DIB bytes, for copying back.
    Image(Vec<u8>),
}

#[derive(Clone)]
struct Entry {
    id: u64,
    hash: u64,
    at: u64,
    content: Content,
    /// PNG thumbnail (images only).
    thumb: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct EntryInfo {
    id: u64,
    at: u64,
    kind: &'static str,
    /// Text content (for text entries).
    text: Option<String>,
    /// base64 PNG thumbnail (for images).
    thumb: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

pub struct ClipboardState {
    enabled: AtomicBool,
    entries: Mutex<Vec<Entry>>,
    next_id: Mutex<u64>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn hash_of<T: Hash>(value: &T) -> u64 {
    let mut h = DefaultHasher::new();
    value.hash(&mut h);
    h.finish()
}

struct OpenGuard;

impl OpenGuard {
    /// Another app may hold the clipboard briefly; retry a few times.
    fn open() -> Option<OpenGuard> {
        for _ in 0..5 {
            if unsafe { OpenClipboard(None) }.as_bool() {
                return Some(OpenGuard);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    }
}

impl Drop for OpenGuard {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}

/// Must be called with the clipboard open.
fn is_private() -> bool {
    unsafe {
        let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
        if IsClipboardFormatAvailable(exclude).as_bool() {
            return true;
        }
        // Present with a DWORD 0 means "keep out of history".
        let history = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
        IsClipboardFormatAvailable(history).as_bool()
            && read_bytes(history).and_then(|b| b.get(0..4).map(|v| u32::from_le_bytes(v.try_into().unwrap()))) == Some(0)
    }
}

/// Copy a clipboard handle's bytes out. Must be called with the clipboard open.
unsafe fn read_bytes(format: u32) -> Option<Vec<u8>> {
    let handle = GetClipboardData(format).ok()?;
    let mem = HGLOBAL(handle.0);
    let size = GlobalSize(mem);
    if size == 0 || size > MAX_IMAGE_BYTES {
        return None;
    }
    let ptr = GlobalLock(mem) as *const u8;
    if ptr.is_null() {
        return None;
    }
    let bytes = std::slice::from_raw_parts(ptr, size).to_vec();
    GlobalUnlock(mem);
    Some(bytes)
}

fn read_clipboard() -> Option<Content> {
    let _guard = OpenGuard::open()?;
    if is_private() {
        return None;
    }
    unsafe {
        if IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32).as_bool() {
            let bytes = read_bytes(CF_UNICODETEXT.0 as u32)?;
            let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
            let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
            let text: String = String::from_utf16_lossy(&wide[..end]).chars().take(MAX_TEXT_CHARS).collect();
            return (!text.trim().is_empty()).then_some(Content::Text(text));
        }
        if IsClipboardFormatAvailable(CF_DIB.0 as u32).as_bool() {
            return read_bytes(CF_DIB.0 as u32).map(Content::Image);
        }
    }
    None
}

/// Decode a 24/32-bit CF_DIB into a downscaled RGBA thumbnail PNG.
fn dib_thumbnail(dib: &[u8]) -> Option<(String, u32, u32)> {
    let u32_at = |o: usize| dib.get(o..o + 4).map(|b| u32::from_le_bytes(b.try_into().unwrap()));
    let header_size = u32_at(0)? as usize;
    let width = u32_at(4)? as i32;
    let height = u32_at(8)? as i32;
    let bit_count = u16::from_le_bytes(dib.get(14..16)?.try_into().ok()?);
    let compression = u32_at(16)?;
    if width <= 0 || height == 0 || !(bit_count == 24 || bit_count == 32) || !(compression == 0 || compression == 3) {
        return None;
    }
    // BI_BITFIELDS with a 40-byte header is followed by three color masks.
    let masks = if compression == 3 && header_size == 40 { 12 } else { 0 };
    let pixels = dib.get(header_size + masks..)?;
    let (w, h) = (width as u32, height.unsigned_abs());
    let bpp = (bit_count / 8) as usize;
    let stride = ((w as usize * bpp) + 3) & !3;
    if pixels.len() < stride * h as usize {
        return None;
    }
    let bottom_up = height > 0;
    let has_alpha = bit_count == 32 && (0..h as usize).any(|y| pixels[y * stride..][..w as usize * 4].chunks(4).any(|p| p[3] != 0));

    let scale = (THUMB_MAX as f32 / w.max(h) as f32).min(1.0);
    let (tw, th) = (((w as f32 * scale) as u32).max(1), ((h as f32 * scale) as u32).max(1));
    let mut rgba = Vec::with_capacity((tw * th * 4) as usize);
    for ty in 0..th {
        let sy = ((ty as f32 / scale) as u32).min(h - 1) as usize;
        let row = if bottom_up { h as usize - 1 - sy } else { sy };
        for tx in 0..tw {
            let sx = ((tx as f32 / scale) as u32).min(w - 1) as usize;
            let p = &pixels[row * stride + sx * bpp..];
            rgba.extend_from_slice(&[p[2], p[1], p[0], if has_alpha { p[3] } else { 255 }]);
        }
    }
    let mut png = Vec::new();
    let mut encoder = png::Encoder::new(&mut png, tw, th);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().ok()?.write_image_data(&rgba).ok()?;
    Some((STANDARD.encode(png), w, h))
}

fn info(entry: &Entry) -> EntryInfo {
    match &entry.content {
        Content::Text(text) => EntryInfo {
            id: entry.id,
            at: entry.at,
            kind: "text",
            text: Some(text.clone()),
            thumb: None,
            width: None,
            height: None,
        },
        Content::Image(dib) => {
            let dims = dib.get(4..12).map(|b| {
                (
                    i32::from_le_bytes(b[0..4].try_into().unwrap()).unsigned_abs(),
                    i32::from_le_bytes(b[4..8].try_into().unwrap()).unsigned_abs(),
                )
            });
            EntryInfo {
                id: entry.id,
                at: entry.at,
                kind: "image",
                text: None,
                thumb: entry.thumb.clone(),
                width: dims.map(|d| d.0),
                height: dims.map(|d| d.1),
            }
        }
    }
}

fn snapshot(state: &ClipboardState) -> Vec<EntryInfo> {
    state.entries.lock().unwrap().iter().map(info).collect()
}

fn record(app: &AppHandle, content: Content) {
    let state = app.state::<ClipboardState>();
    let hash = match &content {
        Content::Text(t) => hash_of(t),
        Content::Image(b) => hash_of(b),
    };
    let thumb = match &content {
        Content::Image(dib) => match dib_thumbnail(dib) {
            Some((png, _, _)) => Some(png),
            None => return, // unsupported image format
        },
        Content::Text(_) => None,
    };
    {
        let mut entries = state.entries.lock().unwrap();
        // Re-copying something already in history just moves it to the top.
        let existing = entries.iter().position(|e| e.hash == hash);
        let id = match existing {
            Some(i) => entries.remove(i).id,
            None => {
                let mut next = state.next_id.lock().unwrap();
                *next += 1;
                *next
            }
        };
        entries.insert(0, Entry { id, hash, at: now_ms(), content, thumb });
        entries.truncate(MAX_ENTRIES);
    }
    let _ = app.emit("clipboard-changed", snapshot(&state));
}

fn run(app: AppHandle) {
    let mut seq = unsafe { GetClipboardSequenceNumber() };
    loop {
        std::thread::sleep(POLL_EVERY);
        let next = unsafe { GetClipboardSequenceNumber() };
        if next == seq {
            continue;
        }
        seq = next;
        if !app.state::<ClipboardState>().enabled.load(Ordering::Relaxed) {
            continue;
        }
        if let Some(content) = read_clipboard() {
            record(&app, content);
        }
    }
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(ClipboardState {
        enabled: AtomicBool::new(true),
        entries: Mutex::new(Vec::new()),
        next_id: Mutex::new(0),
    });
    let handle = app.handle().clone();
    std::thread::Builder::new().name("clipboard".into()).spawn(move || run(handle))?;
    Ok(())
}

fn write_clipboard(content: &Content) -> Result<(), String> {
    let (format, bytes): (u32, Vec<u8>) = match content {
        Content::Text(t) => {
            let wide: Vec<u16> = t.encode_utf16().chain(std::iter::once(0)).collect();
            (CF_UNICODETEXT.0 as u32, wide.iter().flat_map(|c| c.to_le_bytes()).collect())
        }
        Content::Image(dib) => (CF_DIB.0 as u32, dib.clone()),
    };
    let _guard = OpenGuard::open().ok_or("clipboard is busy")?;
    unsafe {
        EmptyClipboard();
        let mem = GlobalAlloc(GMEM_MOVEABLE, bytes.len()).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(mem) as *mut u8;
        if ptr.is_null() {
            return Err("could not lock clipboard memory".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        GlobalUnlock(mem);
        // On success the system owns the memory.
        SetClipboardData(format, HANDLE(mem.0)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_clipboard_history(state: tauri::State<'_, ClipboardState>) -> Vec<EntryInfo> {
    snapshot(&state)
}

/// Put a history entry back on the clipboard (it moves to the top).
#[tauri::command]
pub fn copy_clipboard_entry(id: u64, state: tauri::State<'_, ClipboardState>) -> Result<(), String> {
    let content = state
        .entries
        .lock()
        .unwrap()
        .iter()
        .find(|e| e.id == id)
        .map(|e| e.content.clone())
        .ok_or("entry not found")?;
    write_clipboard(&content)
}

#[tauri::command]
pub fn remove_clipboard_entry(app: AppHandle, id: u64) -> Vec<EntryInfo> {
    let state = app.state::<ClipboardState>();
    state.entries.lock().unwrap().retain(|e| e.id != id);
    snapshot(&state)
}

#[tauri::command]
pub fn clear_clipboard_history(state: tauri::State<'_, ClipboardState>) {
    state.entries.lock().unwrap().clear();
}

/// Turning history off also forgets everything recorded so far.
#[tauri::command]
pub fn set_clipboard_history_enabled(enabled: bool, state: tauri::State<'_, ClipboardState>) {
    state.enabled.store(enabled, Ordering::Relaxed);
    if !enabled {
        state.entries.lock().unwrap().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumbnails_a_32bit_dib() {
        // 2x2 top-down 32bpp BI_RGB: red, green / blue, white.
        let mut dib = Vec::new();
        for v in [40u32, 2, (-2i32) as u32] {
            dib.extend_from_slice(&v.to_le_bytes());
        }
        dib.extend_from_slice(&1u16.to_le_bytes());
        dib.extend_from_slice(&32u16.to_le_bytes());
        dib.extend_from_slice(&[0u8; 24]);
        dib.extend_from_slice(&[0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]);
        let (png, w, h) = dib_thumbnail(&dib).expect("thumbnail");
        assert_eq!((w, h), (2, 2));
        assert!(!png.is_empty());
    }
}
