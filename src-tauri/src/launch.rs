//! Running custom shortcuts: open an installed app (by its AppUserModelId,
//! the same IDs search finds) or a folder/file. Websites open through the
//! opener plugin and FLOAT commands run in the frontend.

use std::path::Path;

fn explorer(arg: &str) -> Result<(), String> {
    std::process::Command::new("explorer").arg(arg).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Launch an app by AppUserModelId (as Get-StartApps lists it).
#[tauri::command]
pub fn launch_app(app_id: String) -> Result<(), String> {
    // AUMIDs are package names or paths; nothing that could end the argument.
    if app_id.is_empty() || app_id.len() > 512 || app_id.chars().any(|c| c == '"' || c.is_control()) {
        return Err("That app can't be opened".into());
    }
    explorer(&format!("shell:AppsFolder\\{app_id}"))
}

/// Open a folder or file that exists, with its default app.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() || !p.exists() {
        return Err("That folder or file isn't there any more".into());
    }
    explorer(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_odd_input() {
        assert!(launch_app(String::new()).is_err());
        assert!(launch_app("x\" & calc".into()).is_err());
        assert!(open_path("relative\\thing".into()).is_err());
        assert!(open_path("C:\\definitely\\not\\here\\float".into()).is_err());
    }
}
