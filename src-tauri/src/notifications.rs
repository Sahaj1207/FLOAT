use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use windows::Foundation::TypedEventHandler;
use windows::UI::Notifications::{UserNotificationChangedKind, UserNotificationChangedEventArgs};
use windows::UI::Notifications::Management::{
    UserNotificationListener, UserNotificationListenerAccessStatus,
};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct NotificationItem {
    pub id: u32,
    #[serde(rename = "appName")]
    pub app_name: String,
    pub title: String,
    pub body: String,
    pub timestamp: u64,
}

#[derive(Clone, Serialize, Debug)]
pub struct NotificationPresencePayload {
    #[serde(rename = "hasNotification")]
    pub has_notification: bool,
    #[serde(rename = "isNew")]
    pub is_new: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<NotificationItem>,
    #[serde(rename = "removedId", skip_serializing_if = "Option::is_none")]
    pub removed_id: Option<u32>,
    #[serde(rename = "initialItems", skip_serializing_if = "Option::is_none")]
    pub initial_items: Option<Vec<NotificationItem>>,
    #[serde(rename = "appName", skip_serializing_if = "Option::is_none")]
    pub app_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

fn extract_item(n: &windows::UI::Notifications::UserNotification) -> Option<NotificationItem> {
    let id = n.Id().ok()?;
    let app_name = n.AppInfo()
        .ok()
        .and_then(|info| info.DisplayInfo().ok())
        .and_then(|disp| disp.DisplayName().ok())
        .map(|h| h.to_string())
        .unwrap_or_else(|| "App".to_string());

    let mut title = String::new();
    let mut body = String::new();

    if let Ok(toast_notif) = n.Notification() {
        if let Ok(visual) = toast_notif.Visual() {
            if let Ok(bindings) = visual.Bindings() {
                for binding in bindings {
                    if let Ok(texts) = binding.GetTextElements() {
                        let mut iter = texts.into_iter();
                        if let Some(t1) = iter.next() {
                            if let Ok(hstring) = t1.Text() {
                                title = hstring.to_string();
                            }
                        }
                        if let Some(t2) = iter.next() {
                            if let Ok(hstring) = t2.Text() {
                                body = hstring.to_string();
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    let timestamp = n.CreationTime()
        .map(|dt| {
            // Windows FileTime to Unix epoch milliseconds: (FileTime / 10,000) - 11,644,473,600,000
            let ms = (dt.UniversalTime / 10_000).saturating_sub(11_644_473_600_000);
            ms as u64
        })
        .unwrap_or_else(|_| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        });

    let app_name_trunc: String = app_name.chars().take(80).collect();
    let title_trunc: String = title.chars().take(120).collect();
    let body_trunc: String = body.chars().take(240).collect();

    Some(NotificationItem {
        id,
        app_name: if app_name_trunc.is_empty() { "App".to_string() } else { app_name_trunc },
        title: title_trunc,
        body: body_trunc,
        timestamp,
    })
}

fn added_payload(item: Option<NotificationItem>) -> NotificationPresencePayload {
    NotificationPresencePayload {
        has_notification: true,
        is_new: true,
        app_name: item.as_ref().map(|i| i.app_name.clone()),
        title: item.as_ref().map(|i| i.title.clone()),
        body: item.as_ref().map(|i| i.body.clone()),
        item,
        removed_id: None,
        initial_items: None,
    }
}

fn removed_payload(id: u32, remaining: usize) -> NotificationPresencePayload {
    NotificationPresencePayload {
        has_notification: remaining > 0,
        is_new: false,
        item: None,
        removed_id: Some(id),
        initial_items: None,
        app_name: None,
        title: None,
        body: None,
    }
}

const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1500);

/// Fallback for when NotificationChanged cannot be registered (it requires
/// package identity, so unpackaged and dev builds always land here): diff
/// the active toast list on an interval and emit the same events.
async fn poll_notifications(
    app: AppHandle,
    listener: UserNotificationListener,
    active_ids: Arc<Mutex<HashSet<u32>>>,
) {
    use windows::UI::Notifications::NotificationKinds;
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;

        let notifs = match listener.GetNotificationsAsync(NotificationKinds::Toast) {
            Ok(op) => match op.await {
                Ok(n) => n,
                Err(_) => continue,
            },
            Err(_) => continue,
        };

        let (added, removed, remaining) = {
            let Ok(mut ids) = active_ids.lock() else { continue };
            let mut current = HashSet::new();
            let mut added = Vec::new();
            for n in &notifs {
                let Ok(id) = n.Id() else { continue };
                current.insert(id);
                if !ids.contains(&id) {
                    added.push(extract_item(&n));
                }
            }
            let removed: Vec<u32> = ids.difference(&current).copied().collect();
            *ids = current;
            (added, removed, ids.len())
        };
        drop(notifs);

        for id in removed {
            dlog!("[NOTIFICATIONS] (poll) REMOVED id: {}", id);
            let _ = app.emit("notification-presence", removed_payload(id, remaining));
        }
        // Oldest first, so the newest ends up as the visible preview.
        let mut added = added;
        added.sort_by_key(|i| i.as_ref().map(|i| i.timestamp).unwrap_or(0));
        for item in added {
            dlog!("[NOTIFICATIONS] (poll) ADDED {:?}", item.as_ref().map(|i| i.id));
            let _ = app.emit("notification-presence", added_payload(item));
        }
    }
}

pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();

    // Spawn listener initialization in a background tokio task
    tauri::async_runtime::spawn(async move {
        if let Err(e) = setup_notification_listener(app_handle).await {
            eprintln!("[NOTIFICATIONS] Initialization error: {:?}", e);
        }
    });

    Ok(())
}

async fn setup_notification_listener(app: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dlog!("[NOTIFICATIONS] Initializing Windows UserNotificationListener...");

    let listener = match UserNotificationListener::Current() {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[NOTIFICATIONS] UserNotificationListener not supported or unavailable: {:?}", e);
            return Ok(());
        }
    };

    // Check access status
    let current_status = listener.GetAccessStatus().unwrap_or(UserNotificationListenerAccessStatus::Unspecified);
    dlog!("[NOTIFICATIONS] Current access status: {:?}", current_status);

    let access_status = if current_status == UserNotificationListenerAccessStatus::Unspecified {
        dlog!("[NOTIFICATIONS] Requesting access via RequestAccessAsync...");
        match listener.RequestAccessAsync() {
            Ok(op) => match op.await {
                Ok(status) => status,
                Err(e) => {
                    eprintln!("[NOTIFICATIONS] RequestAccessAsync error: {:?}", e);
                    UserNotificationListenerAccessStatus::Denied
                }
            },
            Err(e) => {
                eprintln!("[NOTIFICATIONS] Failed to start RequestAccessAsync: {:?}", e);
                UserNotificationListenerAccessStatus::Denied
            }
        }
    } else {
        current_status
    };

    dlog!("[NOTIFICATIONS] Resolved access status: {:?}", access_status);

    if access_status != UserNotificationListenerAccessStatus::Allowed {
        dlog!("[NOTIFICATIONS] Notification access not allowed ({:?}). Listener will remain inactive.", access_status);
        return Ok(());
    }

    let active_ids = Arc::new(Mutex::new(HashSet::<u32>::new()));

    // Seed initial active notifications on startup
    if let Ok(op) = listener.GetNotificationsAsync(windows::UI::Notifications::NotificationKinds::Toast) {
        if let Ok(notifs) = op.await {
            let mut initial_items = Vec::new();
            if let Ok(mut ids) = active_ids.lock() {
                for n in &notifs {
                    if let Ok(id) = n.Id() {
                        ids.insert(id);
                    }
                    if let Some(item) = extract_item(&n) {
                        initial_items.push(item);
                    }
                }
                dlog!("[NOTIFICATIONS] Initial active toast count seeded: {}", ids.len());
            }

            let has_notification = !initial_items.is_empty();
            let first_item = initial_items.first().cloned();

            let payload = NotificationPresencePayload {
                has_notification,
                is_new: false,
                item: first_item.clone(),
                removed_id: None,
                initial_items: Some(initial_items),
                app_name: first_item.as_ref().map(|i| i.app_name.clone()),
                title: first_item.as_ref().map(|i| i.title.clone()),
                body: first_item.as_ref().map(|i| i.body.clone()),
            };
            let _ = app.emit("notification-presence", payload);
        }
    }

    // Register NotificationChanged handler
    let app_clone = app.clone();
    let active_ids_clone = active_ids.clone();
    let listener_clone = listener.clone();

    let handler = TypedEventHandler::<UserNotificationListener, UserNotificationChangedEventArgs>::new(
        move |_sender, args: &Option<UserNotificationChangedEventArgs>| {
            if let Some(event_args) = args {
                if let Ok(change_kind) = event_args.ChangeKind() {
                    let id = event_args.UserNotificationId().unwrap_or(0);
                    match change_kind {
                        UserNotificationChangedKind::Added => {
                            dlog!("[NOTIFICATIONS] Windows notification ADDED (id: {})", id);
                            if let Ok(mut ids) = active_ids_clone.lock() {
                                ids.insert(id);
                            }

                            let item = if let Ok(notification) = listener_clone.GetNotification(id) {
                                extract_item(&notification)
                            } else {
                                None
                            };

                            let _ = app_clone.emit("notification-presence", added_payload(item));
                        }
                        UserNotificationChangedKind::Removed => {
                            dlog!("[NOTIFICATIONS] Windows notification REMOVED (id: {})", id);
                            let remaining_count = if let Ok(mut ids) = active_ids_clone.lock() {
                                ids.remove(&id);
                                ids.len()
                            } else {
                                0
                            };
                            dlog!("[NOTIFICATIONS] Remaining active notifications: {}", remaining_count);
                            let _ = app_clone.emit(
                                "notification-presence",
                                removed_payload(id, remaining_count),
                            );
                        }
                        _ => {}
                    }
                }
            }
            Ok(())
        },
    );

    match listener.NotificationChanged(&handler) {
        Ok(token) => {
            dlog!("[NOTIFICATIONS] NotificationChanged event listener successfully registered (token: {:?})", token);
        }
        Err(e) => {
            dlog!(
                "[NOTIFICATIONS] NotificationChanged unavailable ({:?}); falling back to polling",
                e
            );
            tauri::async_runtime::spawn(poll_notifications(app, listener, active_ids));
        }
    }

    Ok(())
}

#[tauri::command]
pub fn remove_notification(id: u32) -> Result<(), String> {
    dlog!("[NOTIFICATIONS] remove_notification called for id: {}", id);
    if let Ok(listener) = UserNotificationListener::Current() {
        let _ = listener.RemoveNotification(id);
    }
    Ok(())
}

#[tauri::command]
pub fn clear_all_notifications() -> Result<(), String> {
    dlog!("[NOTIFICATIONS] clear_all_notifications called");
    if let Ok(listener) = UserNotificationListener::Current() {
        let _ = listener.ClearNotifications();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_active_notifications() -> Result<Vec<NotificationItem>, String> {
    if let Ok(listener) = UserNotificationListener::Current() {
        if let Ok(op) = listener.GetNotificationsAsync(windows::UI::Notifications::NotificationKinds::Toast) {
            if let Ok(notifs) = op.await {
                let mut items = Vec::new();
                for n in notifs {
                    if let Some(item) = extract_item(&n) {
                        items.push(item);
                    }
                }
                return Ok(items);
            }
        }
    }
    Ok(Vec::new())
}
