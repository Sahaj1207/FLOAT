//! Paste from the island into the app you were using.
//!
//! The paste shortcut remembers the foreground window before FLOAT takes
//! focus. Picking an item puts it on the clipboard, hands focus back to that
//! window and sends Ctrl+V, so it lands where your cursor was.

use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_MENU, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};

static TARGET: AtomicIsize = AtomicIsize::new(0);

/// Called by the paste shortcut, before the island takes focus.
pub fn remember_foreground(app: &AppHandle) {
    let hwnd = unsafe { GetForegroundWindow() };
    let ours = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    // Never "paste into" FLOAT itself.
    if hwnd.0 != 0 && Some(hwnd.0) != ours {
        TARGET.store(hwnd.0, Ordering::SeqCst);
    }
}

fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() }, ..Default::default() },
        },
    }
}

/// Focus the remembered window and press Ctrl+V there. False if there's no
/// window to go back to (the item is still on the clipboard).
fn paste_into_target() -> bool {
    let hwnd = HWND(TARGET.load(Ordering::SeqCst));
    unsafe {
        if hwnd.0 == 0 || !IsWindow(hwnd).as_bool() {
            return false;
        }
        SetForegroundWindow(hwnd);
        // Let focus settle in the target before typing.
        std::thread::sleep(Duration::from_millis(90));
        // Release modifiers the shortcut may have left held, then Ctrl+V.
        let inputs = [
            key(VK_MENU, true),
            key(VK_SHIFT, true),
            key(VK_CONTROL, false),
            key(VIRTUAL_KEY(b'V' as u16), false),
            key(VIRTUAL_KEY(b'V' as u16), true),
            key(VK_CONTROL, true),
        ];
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
    true
}

/// Paste a clipboard-history item into the previous app.
#[tauri::command]
pub async fn paste_history_entry(id: u64, state: tauri::State<'_, crate::clipboard::ClipboardState>) -> Result<bool, String> {
    crate::clipboard::copy_entry(&state, id)?;
    Ok(tauri::async_runtime::spawn_blocking(paste_into_target).await.unwrap_or(false))
}

/// Paste text (a pinned snippet) into the previous app.
#[tauri::command]
pub async fn paste_text(text: String) -> Result<bool, String> {
    crate::clipboard::copy_text(&text)?;
    Ok(tauri::async_runtime::spawn_blocking(paste_into_target).await.unwrap_or(false))
}
