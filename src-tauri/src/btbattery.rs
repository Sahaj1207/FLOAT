//! Battery level of Bluetooth earbuds and headsets.
//!
//! Windows records the level that hands-free devices report (the same number
//! Settings > Bluetooth shows) as a PnP property on the device's
//! "<name> Hands-Free" node, so this reads it with SetupAPI.

use windows::core::GUID;
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDevicePropertyW,
    DIGCF_ALLCLASSES, DIGCF_PRESENT, SP_DEVINFO_DATA,
};
use windows::Win32::Devices::Properties::{DEVPROPKEY, DEVPROPTYPE};
use windows::Win32::Foundation::HWND;
use windows::core::PCWSTR;

/// {104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2: battery percentage (a byte).
const BATTERY: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
    pid: 2,
};
/// DEVPKEY_Device_FriendlyName.
const FRIENDLY_NAME: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 14,
};

unsafe fn property(set: windows::Win32::Devices::DeviceAndDriverInstallation::HDEVINFO, info: &SP_DEVINFO_DATA, key: &DEVPROPKEY) -> Option<Vec<u8>> {
    let mut kind = DEVPROPTYPE::default();
    let mut buf = vec![0u8; 512];
    let mut size = 0u32;
    SetupDiGetDevicePropertyW(set, info, key, &mut kind, Some(&mut buf), Some(&mut size), 0)
        .as_bool()
        .then(|| {
            buf.truncate(size as usize);
            buf
        })
}

fn utf16(bytes: &[u8]) -> String {
    let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
    String::from_utf16_lossy(&wide)
}

/// Every present device that reports a battery level: (friendly name, %).
pub fn levels() -> Vec<(String, u8)> {
    let mut out = Vec::new();
    unsafe {
        let Ok(set) = SetupDiGetClassDevsW(None, PCWSTR::null(), HWND::default(), DIGCF_PRESENT | DIGCF_ALLCLASSES) else {
            return out;
        };
        let mut info = SP_DEVINFO_DATA { cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32, ..Default::default() };
        let mut index = 0;
        while SetupDiEnumDeviceInfo(set, index, &mut info).as_bool() {
            index += 1;
            let Some(battery) = property(set, &info, &BATTERY) else { continue };
            let Some(&percent) = battery.first() else { continue };
            if percent > 100 {
                continue;
            }
            if let Some(name) = property(set, &info, &FRIENDLY_NAME) {
                out.push((utf16(&name), percent));
            }
        }
        SetupDiDestroyDeviceInfoList(set);
    }
    out
}

/// Battery of the device called `name` (as the Bluetooth list names it).
pub fn level_for(name: &str) -> Option<u8> {
    let name = name.trim().to_lowercase();
    levels()
        .into_iter()
        .find(|(n, _)| n.to_lowercase().starts_with(&name))
        .map(|(_, percent)| percent)
}

#[tauri::command]
pub async fn bluetooth_battery(name: String) -> Option<u8> {
    tauri::async_runtime::spawn_blocking(move || level_for(&name)).await.ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lists real devices' battery levels (read-only).
    #[test]
    fn reads_battery_levels() {
        for (name, percent) in levels() {
            println!("{name}: {percent}%");
            assert!(percent <= 100);
        }
    }
}
