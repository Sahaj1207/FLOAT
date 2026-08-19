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
    println!("[NOTIFICATIONS] Initializing Windows UserNotificationListener...");

    let listener = match UserNotificationListener::Current() {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[NOTIFICATIONS] UserNotificationListener not supported or unavailable: {:?}", e);
            return Ok(());
        }
    };

    // Check access status
    let current_status = listener.GetAccessStatus().unwrap_or(UserNotificationListenerAccessStatus::Unspecified);
    println!("[NOTIFICATIONS] Current access status: {:?}", current_status);

    let access_status = if current_status == UserNotificationListenerAccessStatus::Unspecified {
        println!("[NOTIFICATIONS] Requesting access via RequestAccessAsync...");
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

    println!("[NOTIFICATIONS] Resolved access status: {:?}", access_status);

    if access_status != UserNotificationListenerAccessStatus::Allowed {
        println!("[NOTIFICATIONS] Notification access not allowed ({:?}). Listener will remain inactive.", access_status);
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
                println!("[NOTIFICATIONS] Initial active toast count seeded: {}", ids.len());
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
                            println!("[NOTIFICATIONS] Windows notification ADDED (id: {})", id);
                            if let Ok(mut ids) = active_ids_clone.lock() {
                                ids.insert(id);
                            }

                            let item = if let Ok(notification) = listener_clone.GetNotification(id) {
                                extract_item(&notification)
                            } else {
                                None
                            };

                            let payload = NotificationPresencePayload {
                                has_notification: true,
                                is_new: true,
                                item: item.clone(),
                                removed_id: None,
                                initial_items: None,
                                app_name: item.as_ref().map(|i| i.app_name.clone()),
                                title: item.as_ref().map(|i| i.title.clone()),
                                body: item.as_ref().map(|i| i.body.clone()),
                            };
                            let _ = app_clone.emit("notification-presence", payload);
                        }
                        UserNotificationChangedKind::Removed => {
                            println!("[NOTIFICATIONS] Windows notification REMOVED (id: {})", id);
                            let remaining_count = if let Ok(mut ids) = active_ids_clone.lock() {
                                ids.remove(&id);
                                ids.len()
                            } else {
                                0
                            };
                            let has_notification = remaining_count > 0;
                            println!(
                                "[NOTIFICATIONS] Remaining active notifications: {} (has_notification: {})",
                                remaining_count, has_notification
                            );
                            let payload = NotificationPresencePayload {
                                has_notification,
                                is_new: false,
                                item: None,
                                removed_id: Some(id),
                                initial_items: None,
                                app_name: None,
                                title: None,
                                body: None,
                            };
                            let _ = app_clone.emit("notification-presence", payload);
                        }
                        _ => {}
                    }
                    crate::focus::emit_focus_presence(&app_clone);
                }
            }
            Ok(())
        },
    );

    match listener.NotificationChanged(&handler) {
        Ok(token) => {
            println!("[NOTIFICATIONS] NotificationChanged event listener successfully registered (token: {:?})", token);
        }
        Err(e) => {
            eprintln!("[NOTIFICATIONS] Failed to register NotificationChanged handler: {:?}", e);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn remove_notification(id: u32) -> Result<(), String> {
    println!("[NOTIFICATIONS] remove_notification called for id: {}", id);
    if let Ok(listener) = UserNotificationListener::Current() {
        let _ = listener.RemoveNotification(id);
    }
    Ok(())
}

#[tauri::command]
pub fn clear_all_notifications() -> Result<(), String> {
    println!("[NOTIFICATIONS] clear_all_notifications called");
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
