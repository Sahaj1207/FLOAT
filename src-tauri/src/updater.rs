//! Manual updates from GitHub Releases. Nothing runs on its own: the user
//! presses "Check for updates", and only then does FLOAT ask GitHub for the
//! latest release. Installing downloads the matching installer (the MSIX
//! when FLOAT runs as a package, otherwise the setup program), checks it
//! against the SHA-256 GitHub publishes for it, and opens it.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const LATEST: &str = "https://api.github.com/repos/Sahaj1207/FLOAT/releases/latest";
const RELEASE_HOST: &str = "https://github.com/Sahaj1207/FLOAT/releases/download/";
const MAX_INSTALLER_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: String,
    html_url: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize, Clone)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
    /// "sha256:<hex>", published by GitHub for each asset.
    #[serde(default)]
    digest: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current: String,
    latest: String,
    available: bool,
    notes: String,
    page: String,
    /// "msix" or "setup": which installer this copy of FLOAT updates with.
    channel: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    received: u64,
    total: u64,
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(10)))
        .user_agent("FLOAT (https://github.com/Sahaj1207/FLOAT)")
        .build()
        .into()
}

/// "v2.1.0" -> [2, 1, 0]; anything unparsable counts as 0.
fn version_parts(v: &str) -> [u64; 3] {
    let mut out = [0; 3];
    for (slot, part) in out.iter_mut().zip(v.trim().trim_start_matches(['v', 'V']).split(['.', '-', '+'])) {
        *slot = part.parse().unwrap_or(0);
    }
    out
}

/// Packaged (MSIX) installs live under WindowsApps.
fn channel() -> &'static str {
    let exe = std::env::current_exe().unwrap_or_default();
    if exe.to_string_lossy().to_lowercase().contains("\\windowsapps\\") {
        "msix"
    } else {
        "setup"
    }
}

fn latest_release() -> Result<Release, String> {
    agent()
        .get(LATEST)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("Couldn't reach GitHub: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("Unexpected reply from GitHub: {e}"))
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let release = tauri::async_runtime::spawn_blocking(latest_release)
        .await
        .map_err(|e| e.to_string())??;
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    Ok(UpdateInfo {
        available: version_parts(&latest) > version_parts(&current),
        current,
        latest,
        notes: release.body,
        page: release.html_url,
        channel: channel(),
    })
}

fn pick_asset(release: &Release, channel: &str) -> Option<Asset> {
    let wanted = |name: &str| match channel {
        "msix" => name.eq_ignore_ascii_case("FLOAT.msix"),
        _ => name.to_lowercase().ends_with("-setup.exe"),
    };
    release.assets.iter().find(|a| wanted(&a.name)).cloned()
}

/// Download and verify; `progress(received, total)` as bytes arrive.
fn download(asset: &Asset, progress: impl Fn(u64, u64)) -> Result<PathBuf, String> {
    if !asset.browser_download_url.starts_with(RELEASE_HOST) {
        return Err("Unexpected download location".into());
    }
    if asset.size == 0 || asset.size > MAX_INSTALLER_BYTES {
        return Err("Unexpected installer size".into());
    }
    let expected = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
        .map(str::to_lowercase)
        .ok_or("GitHub didn't publish a checksum for this installer")?;

    let mut response = agent()
        .get(&asset.browser_download_url)
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;
    let mut reader = response.body_mut().with_config().limit(asset.size + 1).reader();

    let dir = std::env::temp_dir().join("FLOAT-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&asset.name);
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    let mut last_emit = 0u64;
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        received += n as u64;
        if received - last_emit > 256 * 1024 || received == asset.size {
            last_emit = received;
            progress(received, asset.size);
        }
    }
    drop(file);

    let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if received != asset.size || actual != expected {
        let _ = std::fs::remove_file(&path);
        return Err("The download didn't match GitHub's checksum, so it wasn't opened".into());
    }
    Ok(path)
}

/// Download the latest installer for this copy of FLOAT, verify it and
/// open it. The setup program needs FLOAT closed, so FLOAT quits after
/// starting it; the MSIX installer (App Installer) closes FLOAT itself.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        let release = latest_release()?;
        let asset = pick_asset(&release, channel()).ok_or("This release has no installer for your copy of FLOAT")?;
        download(&asset, |received, total| {
            let _ = handle.emit("update-progress", Progress { received, total });
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    dlog!("[UPDATER] opening {}", path.display());
    if channel() == "msix" {
        std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    } else {
        std::process::Command::new(&path).spawn().map_err(|e| e.to_string())?;
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(800));
            app.exit(0);
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert!(version_parts("v2.1.0") > version_parts("2.0.0"));
        assert!(version_parts("2.0.10") > version_parts("2.0.9"));
        assert!(version_parts("v2.0.0") == version_parts("2.0.0"));
        assert!(version_parts("1.9.9") < version_parts("2.0.0"));
    }

    /// Talks to GitHub; run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn reads_latest_release() {
        let release = latest_release().expect("latest release");
        assert!(release.tag_name.starts_with('v'));
        assert!(!release.assets.is_empty());
    }

    /// Downloads the latest setup program from GitHub and verifies it against
    /// GitHub's checksum, exactly as Install does (without opening it).
    /// Talks to GitHub; run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn downloads_and_verifies_latest() {
        let release = latest_release().expect("latest release");
        for channel in ["setup", "msix"] {
            let asset = pick_asset(&release, channel).expect("installer asset");
            let path = download(&asset, |_, _| {}).expect("download + checksum");
            assert_eq!(std::fs::metadata(&path).unwrap().len(), asset.size);
            let _ = std::fs::remove_file(path);
        }
        // A tampered or truncated download is refused (same test: the
        // downloads share a temp file).
        let mut bad = pick_asset(&release, "setup").expect("installer asset");
        bad.digest = Some(format!("sha256:{}", "0".repeat(64)));
        assert!(download(&bad, |_, _| {}).is_err());
    }

}
