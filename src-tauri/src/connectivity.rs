//! Wi-Fi and Bluetooth: radio state and toggles, the connected network and
//! connected Bluetooth devices. Polled on its own thread; WinRT calls use
//! blocking `.get()` so nothing non-Send crosses an await.

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};
use windows::Networking::Connectivity::NetworkInformation;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

const POLL_EVERY: Duration = Duration::from_secs(3);

#[derive(Clone, PartialEq, Serialize, Default)]
pub struct WifiState {
    /// The machine has a Wi-Fi radio FLOAT may control.
    available: bool,
    on: bool,
    ssid: Option<String>,
    /// 0..=5 signal bars, when connected over Wi-Fi.
    signal: Option<u8>,
}

#[derive(Clone, PartialEq, Serialize, Default)]
pub struct BluetoothState {
    available: bool,
    on: bool,
    /// Names of connected (classic) Bluetooth devices.
    devices: Vec<String>,
}

#[derive(Clone, PartialEq, Serialize, Default)]
pub struct ConnectivityState {
    wifi: WifiState,
    bluetooth: BluetoothState,
    /// Name of the internet connection when it isn't Wi-Fi (e.g. Ethernet).
    wired: Option<String>,
}

#[derive(Clone, Serialize)]
struct BluetoothDeviceEvent {
    name: String,
    connected: bool,
}

fn com_init() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

fn radio(kind: RadioKind) -> Option<Radio> {
    let radios = Radio::GetRadiosAsync().ok()?.get().ok()?;
    let found = radios.into_iter().find(|r| r.Kind().ok() == Some(kind));
    found
}

fn radio_on(kind: RadioKind) -> (bool, bool) {
    match radio(kind) {
        Some(r) => (true, r.State().ok() == Some(RadioState::On)),
        None => (false, false),
    }
}

fn read_network() -> (Option<String>, Option<u8>, Option<String>) {
    let Ok(profile) = NetworkInformation::GetInternetConnectionProfile() else {
        return (None, None, None);
    };
    if profile.IsWlanConnectionProfile().unwrap_or(false) {
        let ssid = profile
            .WlanConnectionProfileDetails()
            .and_then(|d| d.GetConnectedSsid())
            .map(|s| s.to_string())
            .ok()
            .filter(|s| !s.is_empty());
        let signal = profile.GetSignalBars().and_then(|b| b.Value()).ok();
        (ssid, signal, None)
    } else {
        let name = profile.ProfileName().map(|s| s.to_string()).ok().filter(|s| !s.is_empty());
        (None, None, name)
    }
}

fn connected_bluetooth_devices() -> Vec<String> {
    let devices = (|| -> windows::core::Result<Vec<String>> {
        let selector = BluetoothDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)?;
        let found = DeviceInformation::FindAllAsyncAqsFilter(&selector)?.get()?;
        Ok(found.into_iter().filter_map(|d| d.Name().ok()).map(|n| n.to_string()).collect())
    })();
    let mut devices = devices.unwrap_or_default();
    devices.sort();
    devices
}

fn read_state() -> ConnectivityState {
    let (wifi_available, wifi_on) = radio_on(RadioKind::WiFi);
    let (bt_available, bt_on) = radio_on(RadioKind::Bluetooth);
    let (ssid, signal, wired) = read_network();
    ConnectivityState {
        wifi: WifiState { available: wifi_available, on: wifi_on, ssid, signal },
        bluetooth: BluetoothState {
            available: bt_available,
            on: bt_on,
            devices: if bt_on { connected_bluetooth_devices() } else { Vec::new() },
        },
        wired,
    }
}

fn run(app: AppHandle) {
    com_init();
    // Ask once up front; desktop apps are normally allowed.
    if let Ok(op) = Radio::RequestAccessAsync() {
        let _ = op.get();
    }
    let mut state = read_state();
    loop {
        std::thread::sleep(POLL_EVERY);
        let next = read_state();
        if next == state {
            continue;
        }
        for name in next.bluetooth.devices.iter().filter(|d| !state.bluetooth.devices.contains(d)) {
            let _ = app.emit("bluetooth-device", BluetoothDeviceEvent { name: name.clone(), connected: true });
        }
        for name in state.bluetooth.devices.iter().filter(|d| !next.bluetooth.devices.contains(d)) {
            let _ = app.emit("bluetooth-device", BluetoothDeviceEvent { name: name.clone(), connected: false });
        }
        let _ = app.emit("connectivity-changed", next.clone());
        state = next;
    }
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    std::thread::Builder::new()
        .name("connectivity".into())
        .spawn(move || run(handle))?;
    Ok(())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        com_init();
        f()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connectivity() -> Result<ConnectivityState, String> {
    blocking(read_state).await
}

/// Turn the Wi-Fi or Bluetooth radio on or off; returns the new state.
#[tauri::command]
pub async fn set_radio(app: AppHandle, kind: String, on: bool) -> Result<ConnectivityState, String> {
    let state = blocking(move || -> Result<ConnectivityState, String> {
        let kind = match kind.as_str() {
            "wifi" => RadioKind::WiFi,
            "bluetooth" => RadioKind::Bluetooth,
            _ => return Err(format!("unknown radio {kind}")),
        };
        let radio = radio(kind).ok_or("radio not available")?;
        let target = if on { RadioState::On } else { RadioState::Off };
        let status = radio.SetStateAsync(target).and_then(|op| op.get()).map_err(|e| e.to_string())?;
        if status != RadioAccessStatus::Allowed {
            return Err("Windows did not allow changing this radio".into());
        }
        Ok(read_state())
    })
    .await??;
    let _ = app.emit("connectivity-changed", state.clone());
    Ok(state)
}

/// Open a Windows Settings page. Only known pages are allowed.
#[tauri::command]
pub fn open_settings_page(page: String) -> Result<(), String> {
    const PAGES: [&str; 5] = ["network-wifi", "bluetooth", "sound", "quiethours", "batterysaver"];
    if !PAGES.contains(&page.as_str()) {
        return Err("unknown settings page".into());
    }
    std::process::Command::new("explorer")
        .arg(format!("ms-settings:{page}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reads (never changes) the real radios and network.
    #[test]
    fn reads_connectivity() {
        com_init();
        let state = read_state();
        println!(
            "wifi available={} on={} ssid={:?} signal={:?} | bt available={} on={} devices={:?} | wired={:?}",
            state.wifi.available,
            state.wifi.on,
            state.wifi.ssid,
            state.wifi.signal,
            state.bluetooth.available,
            state.bluetooth.on,
            state.bluetooth.devices,
            state.wired
        );
    }
}
