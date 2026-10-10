//! Wi-Fi and Bluetooth: radio state and toggles, the connected network and
//! connected Bluetooth devices. Polled on its own thread; WinRT calls use
//! blocking `.get()` so nothing non-Send crosses an await.

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice};
use windows::Devices::Enumeration::DeviceInformation;
use windows::core::HSTRING;
use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};
use windows::Devices::WiFi::{WiFiAccessStatus, WiFiAdapter, WiFiConnectionStatus, WiFiReconnectionKind};
use windows::Networking::Connectivity::{NetworkAuthenticationType, NetworkInformation};
use windows::Security::Credentials::PasswordCredential;
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
    // "connect-devices" is the Windows connect flyout (Win+K): the supported
    // way to connect an already-paired Bluetooth audio device.
    let uri = if page == "connect-devices" {
        "ms-settings-connectabledevices:devicediscovery".to_string()
    } else if PAGES.contains(&page.as_str()) {
        format!("ms-settings:{page}")
    } else {
        return Err("unknown settings page".into());
    };
    std::process::Command::new("explorer")
        .arg(uri)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// --- Wi-Fi networks ------------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct WifiNetwork {
    ssid: String,
    /// 0..=5
    signal: u8,
    secured: bool,
    connected: bool,
}

fn wifi_adapter() -> Result<WiFiAdapter, String> {
    let access = WiFiAdapter::RequestAccessAsync().and_then(|op| op.get()).map_err(|e| e.to_string())?;
    if access != WiFiAccessStatus::Allowed {
        return Err("Windows has not allowed FLOAT to see Wi-Fi networks (check Location and Wi-Fi privacy settings)".into());
    }
    let adapters = WiFiAdapter::FindAllAdaptersAsync().and_then(|op| op.get()).map_err(|e| e.to_string())?;
    let first = adapters.into_iter().next();
    first.ok_or_else(|| "no Wi-Fi adapter".to_string())
}

fn list_networks(adapter: &WiFiAdapter) -> Vec<WifiNetwork> {
    let connected_ssid = read_network().0;
    let mut best: Vec<WifiNetwork> = Vec::new();
    let Ok(networks) = adapter.NetworkReport().and_then(|r| r.AvailableNetworks()) else {
        return best;
    };
    for network in networks {
        let ssid = network.Ssid().map(|s| s.to_string()).unwrap_or_default();
        if ssid.is_empty() {
            continue; // hidden networks
        }
        let signal = network.SignalBars().unwrap_or(0);
        let secured = network
            .SecuritySettings()
            .and_then(|s| s.NetworkAuthenticationType())
            .map(|t| t != NetworkAuthenticationType::Open80211 && t != NetworkAuthenticationType::None)
            .unwrap_or(true);
        // Access points sharing an SSID collapse into the strongest one.
        match best.iter_mut().find(|n| n.ssid == ssid) {
            Some(existing) => existing.signal = existing.signal.max(signal),
            None => best.push(WifiNetwork {
                connected: connected_ssid.as_deref() == Some(ssid.as_str()),
                ssid,
                signal,
                secured,
            }),
        }
    }
    best.sort_by(|a, b| b.connected.cmp(&a.connected).then(b.signal.cmp(&a.signal)).then(a.ssid.cmp(&b.ssid)));
    best
}

/// Nearby Wi-Fi networks, strongest first. `rescan` asks the adapter to scan
/// first (takes a few seconds); otherwise the last report is returned.
#[tauri::command]
pub async fn wifi_networks(rescan: bool) -> Result<Vec<WifiNetwork>, String> {
    blocking(move || {
        let adapter = wifi_adapter()?;
        if rescan {
            let _ = adapter.ScanAsync().and_then(|op| op.get());
        }
        Ok(list_networks(&adapter))
    })
    .await?
}

/// Join a network. Without a password this works for open networks and ones
/// Windows already has a profile for; otherwise it returns "password-required".
#[tauri::command]
pub async fn wifi_connect(app: AppHandle, ssid: String, password: Option<String>) -> Result<ConnectivityState, String> {
    let state = blocking(move || -> Result<ConnectivityState, String> {
        let adapter = wifi_adapter()?;
        let network = adapter
            .NetworkReport()
            .and_then(|r| r.AvailableNetworks())
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|n| n.Ssid().map(|s| s.to_string() == ssid).unwrap_or(false))
            .max_by_key(|n| n.SignalBars().unwrap_or(0))
            .ok_or("network is no longer in range")?;

        let result = match password.filter(|p| !p.is_empty()) {
            Some(password) => {
                let credential = PasswordCredential::new().map_err(|e| e.to_string())?;
                credential.SetPassword(&HSTRING::from(password)).map_err(|e| e.to_string())?;
                adapter.ConnectWithPasswordCredentialAsync(&network, WiFiReconnectionKind::Automatic, &credential)
            }
            None => adapter.ConnectAsync(&network, WiFiReconnectionKind::Automatic),
        }
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;

        match result.ConnectionStatus().map_err(|e| e.to_string())? {
            WiFiConnectionStatus::Success => Ok(read_state()),
            WiFiConnectionStatus::Timeout => Err("Timed out connecting".into()),
            WiFiConnectionStatus::AccessRevoked => Err("Access was revoked".into()),
            WiFiConnectionStatus::NetworkNotAvailable => Err("Network is not available".into()),
            WiFiConnectionStatus::UnsupportedAuthenticationProtocol => {
                Err("This security type is not supported here".into())
            }
            // InvalidCredential, or no saved profile for a secured network.
            _ => Err("password-required".into()),
        }
    })
    .await??;
    let _ = app.emit("connectivity-changed", state.clone());
    Ok(state)
}

// --- Bluetooth devices ---------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct BluetoothDeviceInfo {
    name: String,
    connected: bool,
}

/// Paired Bluetooth devices, connected ones first.
#[tauri::command]
pub async fn bluetooth_devices() -> Result<Vec<BluetoothDeviceInfo>, String> {
    blocking(|| {
        let mut devices = Vec::new();
        let found = BluetoothDevice::GetDeviceSelectorFromPairingState(true)
            .and_then(|selector| DeviceInformation::FindAllAsyncAqsFilter(&selector))
            .and_then(|op| op.get());
        if let Ok(found) = found {
            for info in found {
                let name = info.Name().map(|n| n.to_string()).unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let connected = info
                    .Id()
                    .and_then(|id| BluetoothDevice::FromIdAsync(&id))
                    .and_then(|op| op.get())
                    .and_then(|d| d.ConnectionStatus())
                    .map(|s| s == BluetoothConnectionStatus::Connected)
                    .unwrap_or(false);
                devices.push(BluetoothDeviceInfo { name, connected });
            }
        }
        devices.sort_by(|a, b| b.connected.cmp(&a.connected).then(a.name.cmp(&b.name)));
        devices
    })
    .await
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

    /// Lists (never changes) nearby networks.
    #[test]
    fn lists_wifi_networks() {
        com_init();
        match wifi_adapter() {
            Ok(adapter) => {
                let networks = list_networks(&adapter);
                println!(
                    "{} networks; first: {:?}",
                    networks.len(),
                    networks.first().map(|n| (n.signal, n.secured, n.connected))
                );
            }
            Err(e) => println!("wifi unavailable: {e}"),
        }
    }
}
