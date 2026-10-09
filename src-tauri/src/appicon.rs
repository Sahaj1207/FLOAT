//! App icons by AppUserModelId, rendered through the shell's Apps folder.
//!
//! Every registered AUMID (Win32 or packaged) is an item in
//! `shell:AppsFolder`, so this works for apps the WinRT AppInfo logo API
//! returns nothing for.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use windows::core::HSTRING;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemInKnownFolder, FOLDERID_AppsFolder, KF_FLAG_DEFAULT,
    SIIGBF_ICONONLY, SIIGBF_RESIZETOFIT,
};

const ICON_SIZE: i32 = 64;

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Read a 32bpp bitmap as straight (non-premultiplied) RGBA rows.
unsafe fn bitmap_rgba(hbmp: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
    let mut bm = BITMAP::default();
    if GetObjectW(hbmp, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
        return None;
    }
    let (w, h) = (bm.bmWidth, bm.bmHeight.abs());
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bgra = vec![0u8; (w * h * 4) as usize];
    let dc = CreateCompatibleDC(None);
    let lines = GetDIBits(dc, hbmp, 0, h as u32, Some(bgra.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
    DeleteDC(dc);
    if lines == 0 {
        return None;
    }

    // Shell bitmaps are usually premultiplied; only undo it if every channel
    // fits under its alpha (otherwise the data was never premultiplied).
    let premultiplied = bgra
        .chunks_exact(4)
        .all(|p| p[0] <= p[3] && p[1] <= p[3] && p[2] <= p[3]);
    let has_alpha = bgra.chunks_exact(4).any(|p| p[3] != 0);
    for p in bgra.chunks_exact_mut(4) {
        p.swap(0, 2); // BGRA -> RGBA
        if !has_alpha {
            p[3] = 255;
        } else if premultiplied && p[3] > 0 && p[3] < 255 {
            let alpha = p[3] as u32;
            for c in &mut p[..3] {
                *c = ((*c as u32 * 255) / alpha).min(255) as u8;
            }
        }
    }
    Some((w as u32, h as u32, bgra))
}

fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, w, h);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().ok()?.write_image_data(rgba).ok()?;
    Some(out)
}

/// Blocking: COM + GDI work, run on a blocking thread.
fn render_icon(app_id: &str) -> Option<String> {
    unsafe {
        // Shell items want an STA; S_FALSE / RPC_E_CHANGED_MODE are fine here.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let factory: IShellItemImageFactory =
            SHCreateItemInKnownFolder(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT.0 as u32, &HSTRING::from(app_id)).ok()?;
        let hbmp = factory
            .GetImage(SIZE { cx: ICON_SIZE, cy: ICON_SIZE }, SIIGBF_ICONONLY | SIIGBF_RESIZETOFIT)
            .ok()?;
        let pixels = bitmap_rgba(hbmp);
        DeleteObject(hbmp);
        let (w, h, rgba) = pixels?;
        Some(STANDARD.encode(encode_png(w, h, &rgba)?))
    }
}

/// The app's icon as base64 PNG, or None if the shell doesn't know it.
#[tauri::command]
pub async fn get_app_icon(app_id: String) -> Option<String> {
    if let Some(cached) = cache().lock().ok()?.get(&app_id) {
        return cached.clone();
    }
    let id = app_id.clone();
    let icon = tauri::async_runtime::spawn_blocking(move || render_icon(&id))
        .await
        .ok()
        .flatten();
    if icon.is_none() {
        dlog!("[APPICON] no icon for {}", app_id);
    }
    if let Ok(mut cache) = cache().lock() {
        cache.insert(app_id, icon.clone());
    }
    icon
}
