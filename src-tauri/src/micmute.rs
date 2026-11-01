//! Microphone mute: one shortcut mutes or unmutes the default recording
//! devices, and the island shows a red mic while they're muted (sysmon polls
//! the state, so muting from Teams, Windows or a headset button shows too).

use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eCapture, eCommunications, eConsole, ERole, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

fn capture_endpoint(role: ERole) -> Option<IAudioEndpointVolume> {
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator.GetDefaultAudioEndpoint(eCapture, role).ok()?;
        device.Activate(CLSCTX_ALL, None).ok()
    }
}

/// The default microphone's endpoint, if there is one.
pub fn default_mic() -> Option<IAudioEndpointVolume> {
    capture_endpoint(eConsole)
}

pub fn read_muted(endpoint: &IAudioEndpointVolume) -> Option<bool> {
    unsafe { endpoint.GetMute().ok().map(|m| m.as_bool()) }
}

/// Flip the mute of the default microphone (and the default communications
/// microphone, which call apps use, if it's a different device). Returns the
/// new state, or None without a microphone.
pub fn toggle() -> Option<bool> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let console = default_mic()?;
    let muted = !read_muted(&console)?;
    unsafe {
        console.SetMute(muted, std::ptr::null()).ok()?;
        if let Some(comms) = capture_endpoint(eCommunications) {
            let _ = comms.SetMute(muted, std::ptr::null());
        }
    }
    dlog!("[MIC] muted={}", muted);
    Some(muted)
}

#[tauri::command]
pub async fn toggle_mic_mute() -> Option<bool> {
    tauri::async_runtime::spawn_blocking(toggle).await.ok().flatten()
}

#[tauri::command]
pub async fn get_mic_muted() -> Option<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        read_muted(&default_mic()?)
    })
    .await
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reads (never changes) the real default microphone.
    #[test]
    fn reads_mic_state() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        if let Some(mic) = default_mic() {
            assert!(read_muted(&mic).is_some());
        }
    }
}
