//! System commands typed into search: lock, sleep, restart, dark mode...
//! Only this fixed list can run. Restart, shut down and sign out are
//! confirmed in the UI first; emptying the Recycle Bin shows Windows' own
//! confirmation.

use std::os::windows::process::CommandExt;
use windows::core::HSTRING;
use windows::Win32::Foundation::{BOOLEAN, HWND, LPARAM, WPARAM};
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::UI::Shell::SHEmptyRecycleBinW;
use windows::Win32::UI::WindowsAndMessaging::{SendMessageTimeoutW, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE};

/// Every top-level window.
const HWND_BROADCAST: HWND = HWND(0xffff);

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PERSONALIZE: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

fn run(program: &str, args: &[&str]) -> Result<(), String> {
    std::process::Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Light or dark for apps and Windows, applied live like the Settings switch.
fn set_light_theme(light: bool) -> Result<(), String> {
    let value = if light { "1" } else { "0" };
    for name in ["AppsUseLightTheme", "SystemUsesLightTheme"] {
        let status = std::process::Command::new("reg")
            .args(["add", PERSONALIZE, "/v", name, "/t", "REG_DWORD", "/d", value, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Couldn't change the theme".into());
        }
    }
    let area = HSTRING::from("ImmersiveColorSet");
    unsafe {
        SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, WPARAM(0), LPARAM(area.as_ptr() as isize), SMTO_ABORTIFHUNG, 2000, None);
    }
    Ok(())
}

#[tauri::command]
pub async fn system_command(name: String) -> Result<(), String> {
    match name.as_str() {
        "lock" => run("rundll32.exe", &["user32.dll,LockWorkStation"]),
        "sleep" => {
            // Off this thread: the call returns only after the PC wakes.
            std::thread::spawn(|| unsafe {
                SetSuspendState(BOOLEAN(0), BOOLEAN(0), BOOLEAN(0));
            });
            Ok(())
        }
        "restart" => run("shutdown", &["/r", "/t", "0"]),
        "shutdown" => run("shutdown", &["/s", "/t", "0"]),
        "signout" => run("shutdown", &["/l"]),
        "dark" => set_light_theme(false),
        "light" => set_light_theme(true),
        "recyclebin" => tauri::async_runtime::spawn_blocking(|| unsafe {
            // Flags 0: Windows asks "Are you sure?" itself.
            SHEmptyRecycleBinW(None, None, 0).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
        // Already empty is not an error worth showing.
        .or(Ok(())),
        "mic" => {
            tauri::async_runtime::spawn_blocking(crate::micmute::toggle).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => Err("Unknown command".into()),
    }
}
