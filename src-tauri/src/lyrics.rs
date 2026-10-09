//! Synced lyrics from LRCLIB (https://lrclib.net). Opt-in: the frontend only
//! calls this when the Synced Lyrics setting is on, since it sends the track
//! title and artist over the network.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const API: &str = "https://lrclib.net/api";
const USER_AGENT: &str = "FLOAT (https://github.com/Sahaj1207/FLOAT)";

#[derive(Clone, Serialize)]
pub struct LyricLine {
    /// Seconds from the start of the track.
    time: f64,
    text: String,
}

#[derive(Deserialize)]
struct LrclibTrack {
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
}

fn cache() -> &'static Mutex<HashMap<String, Option<Vec<LyricLine>>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<Vec<LyricLine>>>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Parse LRC ("[mm:ss.xx] text", possibly several stamps per line).
fn parse_lrc(lrc: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for raw in lrc.lines() {
        let mut rest = raw.trim();
        let mut stamps = Vec::new();
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let stamp = &stripped[..end];
            rest = stripped[end + 1..].trim_start();
            if let Some((m, s)) = stamp.split_once(':') {
                if let (Ok(m), Ok(s)) = (m.parse::<f64>(), s.parse::<f64>()) {
                    stamps.push(m * 60.0 + s);
                }
            }
        }
        for time in stamps {
            lines.push(LyricLine { time, text: rest.to_string() });
        }
    }
    lines.sort_by(|a, b| a.time.total_cmp(&b.time));
    lines
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(8)))
        .user_agent(USER_AGENT)
        .http_status_as_error(false)
        .build()
        .into()
}

fn fetch(title: &str, artist: &str, album: Option<&str>, duration: Option<f64>) -> Option<Vec<LyricLine>> {
    let agent = agent();

    // Exact match first (best with album + duration), then a search.
    let mut get = agent.get(format!("{API}/get")).query("track_name", title).query("artist_name", artist);
    if let Some(album) = album {
        get = get.query("album_name", album);
    }
    if let Some(d) = duration {
        get = get.query("duration", (d.round() as i64).to_string());
    }
    if let Ok(mut resp) = get.call() {
        if resp.status() == 200 {
            if let Ok(track) = resp.body_mut().read_json::<LrclibTrack>() {
                if let Some(lrc) = track.synced_lyrics.filter(|l| !l.trim().is_empty()) {
                    return Some(parse_lrc(&lrc));
                }
            }
        }
    }

    let mut resp = agent
        .get(format!("{API}/search"))
        .query("track_name", title)
        .query("artist_name", artist)
        .call()
        .ok()?;
    if resp.status() != 200 {
        return None;
    }
    let results: Vec<LrclibTrack> = resp.body_mut().read_json().ok()?;
    let lrc = results.into_iter().find_map(|t| t.synced_lyrics.filter(|l| !l.trim().is_empty()))?;
    Some(parse_lrc(&lrc))
}

/// Time-synced lyrics for a track, or None if LRCLIB has none.
#[tauri::command]
pub async fn get_lyrics(
    title: String,
    artist: String,
    album: Option<String>,
    duration: Option<f64>,
) -> Option<Vec<LyricLine>> {
    let key = format!("{}\u{1f}{}", title.to_lowercase(), artist.to_lowercase());
    if let Some(hit) = cache().lock().ok()?.get(&key) {
        return hit.clone();
    }
    let result = tauri::async_runtime::spawn_blocking(move || fetch(&title, &artist, album.as_deref(), duration))
        .await
        .ok()
        .flatten()
        .filter(|lines| !lines.is_empty());
    if let Ok(mut c) = cache().lock() {
        c.insert(key, result.clone());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lrc() {
        let lines = parse_lrc("[00:01.50] Hello\n[00:04.00][01:00.00] Again\n[ti:Title]\n");
        let summary: Vec<(f64, &str)> = lines.iter().map(|l| (l.time, l.text.as_str())).collect();
        assert_eq!(summary, vec![(1.5, "Hello"), (4.0, "Again"), (60.0, "Again")]);
    }
}

#[cfg(test)]
mod network_tests {
    use super::*;

    #[test]
    #[ignore = "hits lrclib.net"]
    fn fetches_known_track() {
        let lines = fetch("Midnight City", "M83", None, None).expect("synced lyrics");
        println!("{} lines; first: {:?}", lines.len(), lines.iter().find(|l| !l.text.is_empty()).map(|l| (l.time, &l.text)));
    }
}
