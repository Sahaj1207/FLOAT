use tauri::{AppHandle, Emitter, Manager};
use serde::Serialize;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;

#[derive(Clone, Serialize, Default, Debug, PartialEq)]
pub struct MediaSession {
    pub id: String,
    #[serde(rename = "hasMedia")]
    pub has_media: bool,
    #[serde(rename = "isPlaying")]
    pub is_playing: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "albumArtBase64")]
    pub album_art_base64: Option<String>,
    pub position: Option<f64>,
    pub duration: Option<f64>,
    #[serde(rename = "canPlayPause")]
    pub can_play_pause: bool,
    #[serde(rename = "canGoNext")]
    pub can_go_next: bool,
    #[serde(rename = "canGoPrev")]
    pub can_go_prev: bool,
    #[serde(rename = "canSeek")]
    pub can_seek: bool,
    #[serde(rename = "lastUpdated")]
    pub last_updated: u64,
}

#[derive(Clone, Serialize, Debug)]
pub struct MultiSessionState {
    pub sessions: Vec<MediaSession>,
    #[serde(rename = "activeSessionId")]
    pub active_session_id: Option<String>,
    #[serde(rename = "selectedSessionId")]
    pub selected_session_id: Option<String>,
}

#[derive(Clone, Serialize, Debug)]
pub struct SessionPositionPayload {
    pub id: String,
    pub position: Option<f64>,
    pub duration: Option<f64>,
}

pub struct MediaStateManager {
    pub active_id: Arc<Mutex<Option<String>>>,
    pub selected_id: Arc<Mutex<Option<String>>>,
    pub sessions: Arc<Mutex<HashMap<String, MediaSession>>>,
    pub gsmtc_map: Arc<Mutex<HashMap<String, usize>>>,
}

#[cfg(target_os = "windows")]
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();
    
    let active_id = Arc::new(Mutex::new(None::<String>));
    let selected_id = Arc::new(Mutex::new(None::<String>));
    let sessions = Arc::new(Mutex::new(HashMap::<String, MediaSession>::new()));
    let gsmtc_map = Arc::new(Mutex::new(HashMap::<String, usize>::new()));
    
    app.manage(MediaStateManager {
        active_id: active_id.clone(),
        selected_id: selected_id.clone(),
        sessions: sessions.clone(),
        gsmtc_map: gsmtc_map.clone(),
    });
    
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_media_listener(app_handle, active_id, selected_id, sessions, gsmtc_map).await {
            eprintln!("[MEDIA ERROR] Listener crashed: {}", e);
        }
    });

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(MediaStateManager {
        active_id: Arc::new(Mutex::new(None::<String>)),
        selected_id: Arc::new(Mutex::new(None::<String>)),
        sessions: Arc::new(Mutex::new(HashMap::<String, MediaSession>::new())),
        gsmtc_map: Arc::new(Mutex::new(HashMap::<String, usize>::new())),
    });
    Ok(())
}

#[tauri::command]
pub async fn get_multi_session_state(state: tauri::State<'_, MediaStateManager>) -> Result<MultiSessionState, String> {
    let sessions_map = state.sessions.lock().await;
    let active_id = state.active_id.lock().await.clone();
    let selected_id = state.selected_id.lock().await.clone();

    let sessions_vec: Vec<MediaSession> = sessions_map.values().cloned().collect();

    Ok(MultiSessionState {
        sessions: sessions_vec,
        active_session_id: active_id,
        selected_session_id: selected_id,
    })
}

#[tauri::command]
pub async fn select_media_session(
    session_id: String,
    state: tauri::State<'_, MediaStateManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut selected = state.selected_id.lock().await;
        *selected = Some(session_id.clone());
    }

    let sessions_map = state.sessions.lock().await;
    let active_id = state.active_id.lock().await.clone();
    let sessions_vec: Vec<MediaSession> = sessions_map.values().cloned().collect();

    let payload = MultiSessionState {
        sessions: sessions_vec,
        active_session_id: active_id,
        selected_session_id: Some(session_id),
    };

    let _ = app.emit("multi-session-changed", payload);
    Ok(())
}

#[cfg(target_os = "windows")]
async fn run_media_listener(
    app_handle: AppHandle,
    active_session_id: Arc<Mutex<Option<String>>>,
    selected_session_id: Arc<Mutex<Option<String>>>,
    session_states: Arc<Mutex<HashMap<String, MediaSession>>>,
    gsmtc_id_map: Arc<Mutex<HashMap<String, usize>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use gsmtc::{ManagerEvent, SessionManager, SessionUpdateEvent};

    let mut rx = SessionManager::create().await?;

    let emit_multi_state = {
        let app = app_handle.clone();
        let states_ref = session_states.clone();
        let active_ref = active_session_id.clone();
        let selected_ref = selected_session_id.clone();
        move || {
            let app_c = app.clone();
            let states_c = states_ref.clone();
            let active_c = active_ref.clone();
            let selected_c = selected_ref.clone();
            tokio::spawn(async move {
                let map = states_c.lock().await;
                let active = active_c.lock().await.clone();
                let selected = selected_c.lock().await.clone();
                let sessions: Vec<MediaSession> = map.values().cloned().collect();

                let payload = MultiSessionState {
                    sessions,
                    active_session_id: active,
                    selected_session_id: selected,
                };
                let _ = app_c.emit("multi-session-changed", payload);
            });
        }
    };

    while let Some(event) = rx.recv().await {
        match event {
            ManagerEvent::CurrentSessionChanged { session_id } => {
                let gsmtc_map = gsmtc_id_map.lock().await;
                let mut found_str_id = None;
                if let Some(num_id) = session_id {
                    for (str_id, &n_id) in gsmtc_map.iter() {
                        if n_id == num_id {
                            found_str_id = Some(str_id.clone());
                            break;
                        }
                    }
                }
                
                {
                    let mut active_lock = active_session_id.lock().await;
                    *active_lock = found_str_id.clone();
                }

                {
                    let mut selected_lock = selected_session_id.lock().await;
                    if selected_lock.is_none() || (found_str_id.is_some() && selected_lock.is_none()) {
                        *selected_lock = found_str_id.clone();
                    }
                }

                emit_multi_state();
            }
            ManagerEvent::SessionCreated { mut rx, session_id, source } => {
                let str_id = format!("{}_{}", source, session_id);
                {
                    let mut g_map = gsmtc_id_map.lock().await;
                    g_map.insert(str_id.clone(), session_id);
                }

                let source_name = source.clone();
                let states_ref = session_states.clone();
                let str_id_clone = str_id.clone();
                let app = app_handle.clone();
                let emit_fn = emit_multi_state.clone();

                tauri::async_runtime::spawn(async move {
                    let mut local_session = MediaSession::default();
                    local_session.id = str_id_clone.clone();
                    local_session.source = Some(source_name.clone());
                    local_session.can_play_pause = true;
                    local_session.can_go_next = true;
                    local_session.can_go_prev = true;

                    // Immediately register initial session placeholder so it exists in multi-session state
                    {
                        let mut states = states_ref.lock().await;
                        states.insert(str_id_clone.clone(), local_session.clone());
                    }
                    emit_fn();

                    fn apply_model(session: &mut MediaSession, model: &gsmtc::SessionModel) -> (bool, bool) {
                        let mut state_changed = false;
                        let mut position_changed = false;

                        session.can_play_pause = true;
                        session.can_go_next = true;
                        session.can_go_prev = true;

                        if let Some(playback) = &model.playback {
                            let new_playing = playback.status == gsmtc::PlaybackStatus::Playing;
                            if session.is_playing != new_playing {
                                session.is_playing = new_playing;
                                state_changed = true;
                            }
                        }

                        if let Some(timeline) = &model.timeline {
                            let new_pos = Some(timeline.position as f64 / 10000000.0);
                            let new_dur = Some(timeline.end as f64 / 10000000.0);
                            let new_can_seek = timeline.end > 0;
                            if session.position != new_pos || session.duration != new_dur || session.can_seek != new_can_seek {
                                session.position = new_pos;
                                session.duration = new_dur;
                                session.can_seek = new_can_seek;
                                position_changed = true;
                            }
                        }

                        if let Some(media) = &model.media {
                            let new_title = if media.title.trim().is_empty() { None } else { Some(media.title.clone()) };
                            let new_artist = if media.artist.trim().is_empty() { None } else { Some(media.artist.clone()) };
                            let new_album = media.album.as_ref().and_then(|a| if a.title.trim().is_empty() { None } else { Some(a.title.clone()) });
                            let has_media = new_title.is_some() || new_artist.is_some() || new_album.is_some() || session.album_art_base64.is_some();

                            if session.title != new_title || session.artist != new_artist || session.album != new_album || session.has_media != has_media {
                                session.title = new_title;
                                session.artist = new_artist;
                                session.album = new_album;
                                session.has_media = has_media;
                                state_changed = true;
                            }
                        }

                        (state_changed, position_changed)
                    }

                    while let Some(update) = rx.recv().await {
                        let (state_changed, position_changed) = match update {
                            SessionUpdateEvent::Model(model) => {
                                apply_model(&mut local_session, &model)
                            }
                            SessionUpdateEvent::Media(model, image_opt) => {
                                let (sc, pc) = apply_model(&mut local_session, &model);
                                let mut art_changed = false;
                                if let Some(image) = image_opt {
                                    let new_art = Some(STANDARD.encode(&image.data));
                                    if local_session.album_art_base64 != new_art {
                                        local_session.album_art_base64 = new_art;
                                        local_session.has_media = true;
                                        art_changed = true;
                                    }
                                } else if local_session.album_art_base64.is_some() {
                                    local_session.album_art_base64 = None;
                                    art_changed = true;
                                }
                                (sc || art_changed, pc)
                            }
                        };

                        if state_changed || position_changed {
                            local_session.last_updated = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();

                            {
                                let mut states = states_ref.lock().await;
                                states.insert(str_id_clone.clone(), local_session.clone());
                            }

                            if state_changed {
                                emit_fn();
                            }

                            if position_changed {
                                let _ = app.emit(
                                    "session-position-changed",
                                    SessionPositionPayload {
                                        id: str_id_clone.clone(),
                                        position: local_session.position,
                                        duration: local_session.duration,
                                    },
                                );
                            }
                        }
                    }
                });
            }
            ManagerEvent::SessionRemoved { session_id } => {
                let mut target_str_id = None;
                {
                    let mut g_map = gsmtc_id_map.lock().await;
                    g_map.retain(|k, v| {
                        if *v == session_id {
                            target_str_id = Some(k.clone());
                            false
                        } else {
                            true
                        }
                    });
                }

                if let Some(s_id) = target_str_id {
                    let mut states = session_states.lock().await;
                    states.remove(&s_id);

                    let mut active_lock = active_session_id.lock().await;
                    if *active_lock == Some(s_id.clone()) {
                        *active_lock = states.keys().next().cloned();
                    }

                    let mut selected_lock = selected_session_id.lock().await;
                    if *selected_lock == Some(s_id.clone()) {
                        *selected_lock = active_lock.clone();
                    }

                    emit_multi_state();
                }
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn resolve_target_session(
    target_id: Option<&str>,
    state: &MediaStateManager,
) -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let selected_id = state.selected_id.lock().await.clone();
    let tid_string = target_id.map(|s| s.to_string()).or(selected_id);
    let tid = tid_string.as_deref();

    let target_num_id = if let Some(t) = tid {
        let gsmtc_map = state.gsmtc_map.lock().await;
        gsmtc_map.get(t).copied()
    } else {
        None
    };

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().ok()?.await.ok()?;
    let sessions = manager.GetSessions().ok()?;
    let count = sessions.Size().unwrap_or(0);
    if count == 0 {
        return None;
    }

    if let Some(tid) = tid {
        // Step 1: Check gsmtc_map for exact numerical ID lookup
        if let Some(num_id) = target_num_id {
            if (num_id as u32) < count {
                if let Ok(sess) = sessions.GetAt(num_id as u32) {
                    return Some(sess);
                }
            }
        }

        // Step 2: Fallback to matching SourceAppUserModelId against target_id prefix
        let source_part = tid.rfind('_').map(|i| &tid[..i]).unwrap_or(tid);
        for i in 0..count {
            if let Ok(sess) = sessions.GetAt(i) {
                if let Ok(src) = sess.SourceAppUserModelId() {
                    let src_str = src.to_string();
                    if src_str == source_part || src_str.contains(source_part) || source_part.contains(&src_str) {
                        return Some(sess);
                    }
                }
            }
        }
    }

    // Step 3: Default to current active GSMTC session or first available session
    if let Ok(current) = manager.GetCurrentSession() {
        return Some(current);
    }
    sessions.GetAt(0).ok()
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn media_play_pause(
    session_id: Option<String>,
    state: tauri::State<'_, MediaStateManager>,
) -> Result<(), String> {
    println!("[MEDIA CONTROL] play_pause requested for session {:?}", session_id);
    if let Some(sess) = resolve_target_session(session_id.as_deref(), &state).await {
        let _ = sess.TryTogglePlayPauseAsync().map_err(|e| e.to_string())?.await;
    }
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn media_next(
    session_id: Option<String>,
    state: tauri::State<'_, MediaStateManager>,
) -> Result<(), String> {
    println!("[MEDIA CONTROL] next requested for session {:?}", session_id);
    if let Some(sess) = resolve_target_session(session_id.as_deref(), &state).await {
        let _ = sess.TrySkipNextAsync().map_err(|e| e.to_string())?.await;
    }
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn media_prev(
    session_id: Option<String>,
    state: tauri::State<'_, MediaStateManager>,
) -> Result<(), String> {
    println!("[MEDIA CONTROL] prev requested for session {:?}", session_id);
    if let Some(sess) = resolve_target_session(session_id.as_deref(), &state).await {
        let _ = sess.TrySkipPreviousAsync().map_err(|e| e.to_string())?.await;
    }
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn media_seek(
    session_id: Option<String>,
    position: f64,
    state: tauri::State<'_, MediaStateManager>,
) -> Result<(), String> {
    println!("[MEDIA SEEK] seek requested to {:.2}s for session {:?}", position, session_id);
    if let Some(sess) = resolve_target_session(session_id.as_deref(), &state).await {
        let target_ticks = (position * 10000000.0) as i64;
        let res = sess.TryChangePlaybackPositionAsync(target_ticks);
        match res {
            Ok(op) => match op.await {
                Ok(success) => println!("[MEDIA SEEK] TryChangePlaybackPositionAsync result = Ok({})", success),
                Err(e) => println!("[MEDIA SEEK ERROR] TryChangePlaybackPositionAsync await error = {}", e),
            },
            Err(e) => println!("[MEDIA SEEK ERROR] TryChangePlaybackPositionAsync call error = {}", e),
        }
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub async fn media_play_pause(_session_id: Option<String>) -> Result<(), String> { Ok(()) }

#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub async fn media_next(_session_id: Option<String>) -> Result<(), String> { Ok(()) }

#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub async fn media_prev(_session_id: Option<String>) -> Result<(), String> { Ok(()) }

#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub async fn media_seek(_session_id: Option<String>, _position: f64) -> Result<(), String> { Ok(()) }
