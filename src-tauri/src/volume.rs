//! System output volume (default render endpoint) via Core Audio.

use serde::Serialize;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

#[derive(Clone, Copy, Serialize)]
pub struct VolumeState {
    /// 0.0 ..= 1.0
    pub level: f32,
    pub muted: bool,
}

/// Blocking; COM calls run on a blocking thread.
fn with_endpoint<T>(f: impl FnOnce(&IAudioEndpointVolume) -> windows::core::Result<T>) -> Option<T> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
        f(&endpoint).ok()
    }
}

fn read(endpoint: &IAudioEndpointVolume) -> windows::core::Result<VolumeState> {
    unsafe {
        Ok(VolumeState {
            level: endpoint.GetMasterVolumeLevelScalar()?,
            muted: endpoint.GetMute()?.as_bool(),
        })
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Option<T> + Send + 'static) -> Option<T> {
    tauri::async_runtime::spawn_blocking(f).await.ok().flatten()
}

#[tauri::command]
pub async fn get_volume() -> Option<VolumeState> {
    blocking(|| with_endpoint(read)).await
}

/// Nudge the volume by `delta` (-1..1). Raising it also unmutes, like the
/// hardware volume keys.
#[tauri::command]
pub async fn change_volume(delta: f32) -> Option<VolumeState> {
    blocking(move || {
        with_endpoint(|endpoint| unsafe {
            let level = (endpoint.GetMasterVolumeLevelScalar()? + delta).clamp(0.0, 1.0);
            endpoint.SetMasterVolumeLevelScalar(level, std::ptr::null())?;
            if delta > 0.0 {
                endpoint.SetMute(false, std::ptr::null())?;
            }
            read(endpoint)
        })
    })
    .await
}

/// Set the volume to `level` (0..1).
#[tauri::command]
pub async fn set_volume(level: f32) -> Option<VolumeState> {
    blocking(move || {
        with_endpoint(|endpoint| unsafe {
            endpoint.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())?;
            read(endpoint)
        })
    })
    .await
}

#[tauri::command]
pub async fn toggle_mute() -> Option<VolumeState> {
    blocking(|| {
        with_endpoint(|endpoint| unsafe {
            let muted = endpoint.GetMute()?.as_bool();
            endpoint.SetMute(!muted, std::ptr::null())?;
            read(endpoint)
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reads (never changes) the real default endpoint.
    #[test]
    fn reads_default_endpoint_volume() {
        let state = with_endpoint(read).expect("default render endpoint");
        assert!((0.0..=1.0).contains(&state.level));
    }
}
