//! Built-in display brightness via WMI (laptop panels; most external
//! monitors don't expose this). One thread owns the (non-Send) WMI
//! connection: it polls the level so brightness keys show the HUD, and
//! applies set requests sent over a channel.

use serde::Deserialize;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use wmi::WMIConnection;

const POLL_EVERY: Duration = Duration::from_millis(500);

#[derive(Deserialize)]
#[serde(rename = "WmiMonitorBrightness")]
#[serde(rename_all = "PascalCase")]
struct MonitorBrightness {
    current_brightness: u8,
}

#[derive(Deserialize)]
#[serde(rename = "WmiMonitorBrightnessMethods")]
struct MonitorBrightnessMethods {
    #[serde(rename = "__Path")]
    path: String,
}

/// Last known level (0-100), or None when brightness isn't controllable.
static LEVEL: Mutex<Option<u8>> = Mutex::new(None);
static SETTER: OnceLock<Mutex<Sender<u8>>> = OnceLock::new();

fn read(con: &WMIConnection) -> Option<u8> {
    let rows: Vec<MonitorBrightness> = con.query().ok()?;
    rows.first().map(|r| r.current_brightness)
}

fn write(con: &WMIConnection, level: u8) -> Option<()> {
    let methods: Vec<MonitorBrightnessMethods> = con.query().ok()?;
    let target = methods.first()?;
    let params = con
        .get_object("WmiMonitorBrightnessMethods")
        .ok()?
        .get_method("WmiSetBrightness")
        .ok()??
        .spawn_instance()
        .ok()?;
    params.put_property("Timeout", 0u32).ok()?;
    params.put_property("Brightness", level).ok()?;
    con.exec_method(&target.path, "WmiSetBrightness", Some(&params)).ok()?;
    Some(())
}

fn run(app: AppHandle) {
    let Ok(con) = WMIConnection::with_namespace_path("ROOT\\WMI") else { return };
    let Some(initial) = read(&con) else {
        dlog!("[BRIGHTNESS] not controllable on this display");
        return;
    };
    *LEVEL.lock().unwrap() = Some(initial);
    let (tx, rx) = channel::<u8>();
    let _ = SETTER.set(Mutex::new(tx));
    let mut level = initial;

    loop {
        match rx.recv_timeout(POLL_EVERY) {
            Ok(mut target) => {
                // Coalesce a burst of slider moves into the latest value.
                while let Ok(newer) = rx.try_recv() {
                    target = newer;
                }
                let _ = write(&con, target);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        if let Some(next) = read(&con) {
            if next != level {
                level = next;
                *LEVEL.lock().unwrap() = Some(level);
                let _ = app.emit("brightness-changed", level);
            }
        }
    }
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    std::thread::Builder::new().name("brightness".into()).spawn(move || run(handle))?;
    Ok(())
}

/// Current brightness 0-100, or None if it can't be controlled.
#[tauri::command]
pub fn get_brightness() -> Option<u8> {
    *LEVEL.lock().unwrap()
}

#[tauri::command]
pub fn set_brightness(level: u8) -> Result<(), String> {
    let setter = SETTER.get().ok_or("brightness is not controllable on this display")?;
    setter.lock().unwrap().send(level.min(100)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reads (never changes) the real panel brightness.
    #[test]
    fn reads_brightness() {
        let con = WMIConnection::with_namespace_path("ROOT\\WMI").expect("wmi");
        println!("brightness = {:?}", read(&con));
    }

    /// Writes the current level back unchanged, exercising the set path.
    #[test]
    fn writes_same_brightness() {
        let con = WMIConnection::with_namespace_path("ROOT\\WMI").expect("wmi");
        let level = read(&con).expect("level");
        assert!(write(&con, level).is_some(), "WmiSetBrightness failed");
        assert_eq!(read(&con), Some(level));
    }
}
