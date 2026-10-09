/**
 * FLOAT — Platform Abstraction Layer
 *
 * Isolates all platform-specific (Tauri / OS) calls behind a clean API.
 * The React UI imports only from this module, never directly from Tauri APIs.
 *
 * Future OS-specific adapters (Windows, macOS, Linux) can extend or replace
 * individual functions here without touching the UI layer.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";

/* ------------------------------------------------------------------ */
/*  Window management                                                  */
/* ------------------------------------------------------------------ */

/** Start a native window drag (call on pointerdown on drag-handle areas). */
export async function startWindowDrag(): Promise<void> {
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // Silently fail if not in a Tauri context (e.g. browser dev)
  }
}

/** A rectangle in logical px relative to the island window's top-left. */
export interface HitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tell the native side where the island currently is. Everywhere outside
 * these rectangles the window is click-through.
 */
export async function setHitRegions(regions: HitRect[]): Promise<void> {
  try {
    await invoke("set_hit_regions", { regions });
  } catch {
    // Not in a Tauri context
  }
}

/** Fires when the cursor enters or leaves the island's hit regions. */
export async function subscribeToIslandHover(
  callback: (inside: boolean) => void
): Promise<UnlistenFn> {
  return await listen<{ inside: boolean }>("island-hover", (event) => {
    callback(event.payload.inside);
  });
}

/** Fires when the island window gains or loses keyboard focus. */
export async function subscribeToWindowFocus(
  callback: (focused: boolean) => void
): Promise<UnlistenFn> {
  try {
    return await getCurrentWindow().onFocusChanged((event) => callback(event.payload));
  } catch {
    return () => {};
  }
}

export type IslandCommand = "open" | "toggle";

/** Commands from the tray icon, global hotkey, or a second app launch. */
export async function subscribeToIslandCommand(
  callback: (command: IslandCommand) => void
): Promise<UnlistenFn> {
  return await listen<IslandCommand>("island-command", (event) => {
    callback(event.payload);
  });
}

/** The global hotkey that opens the island, or null if none could be registered. */
export async function getHotkey(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_hotkey");
  } catch {
    return null;
  }
}

export async function getAutostart(): Promise<boolean> {
  try {
    return await invoke<boolean>("get_autostart");
  } catch {
    return false;
  }
}

/** Returns the resulting state, which may differ from the request. */
export async function setAutostart(enabled: boolean): Promise<boolean> {
  try {
    return await invoke<boolean>("set_autostart", { enabled });
  } catch {
    return false;
  }
}

export async function subscribeToAutostart(
  callback: (enabled: boolean) => void
): Promise<UnlistenFn> {
  return await listen<boolean>("autostart-changed", (event) => {
    callback(event.payload);
  });
}

export interface AudioLevelsPayload {
  /** Low, mid, high band levels, 0..1. */
  levels: number[];
  silent: boolean;
}

/** Start or stop native loopback capture for the equalizer. */
export async function setVisualizerActive(active: boolean): Promise<void> {
  try {
    await invoke("set_visualizer_active", { active });
  } catch {
    // Not in a Tauri context
  }
}

export async function subscribeToAudioLevels(
  callback: (payload: AudioLevelsPayload) => void
): Promise<UnlistenFn> {
  try {
    return await listen<AudioLevelsPayload>("audio-levels", (event) => callback(event.payload));
  } catch {
    return () => {};
  }
}

export async function setHideInFullscreen(enabled: boolean): Promise<void> {
  try {
    await invoke("set_hide_in_fullscreen", { enabled });
  } catch {
    // Not in a Tauri context
  }
}

/* ------------------------------------------------------------------ */
/*  Platform detection                                                  */
/* ------------------------------------------------------------------ */

export type Platform = "windows" | "macos" | "linux" | "unknown";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Media Control (Normalized)                                          */
/* ------------------------------------------------------------------ */

import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MultiSessionState, SessionPositionPayload } from "./media";

export async function subscribeToMultiSessionState(
  callback: (payload: MultiSessionState) => void
): Promise<UnlistenFn> {
  return await listen<MultiSessionState>("multi-session-changed", (event) => {
    callback(event.payload);
  });
}

export async function subscribeToSessionPosition(
  callback: (payload: SessionPositionPayload) => void
): Promise<UnlistenFn> {
  return await listen<SessionPositionPayload>("session-position-changed", (event) => {
    callback(event.payload);
  });
}

export interface NotificationItem {
  id: number;
  appName: string;
  title: string;
  body: string;
  timestamp: number;
  appId?: string;
  isRead?: boolean;
}

export interface NotificationPresencePayload {
  hasNotification: boolean;
  isNew: boolean;
  item?: NotificationItem;
  removedId?: number;
  initialItems?: NotificationItem[];
  appName?: string;
  title?: string;
  body?: string;
}

export async function subscribeToNotificationPresence(
  callback: (payload: NotificationPresencePayload) => void
): Promise<UnlistenFn> {
  return await listen<NotificationPresencePayload>("notification-presence", (event) => {
    callback(event.payload);
  });
}

export async function removeNotification(id: number): Promise<void> {
  try {
    await invoke("remove_notification", { id });
  } catch (e) {
    console.error("removeNotification failed:", e);
  }
}

export async function clearAllNotifications(): Promise<void> {
  try {
    await invoke("clear_all_notifications");
  } catch (e) {
    console.error("clearAllNotifications failed:", e);
  }
}

/** Base64 PNG logo for an app (by AppUserModelId), or null. */
export async function getAppIcon(appId: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_app_icon", { appId });
  } catch {
    return null;
  }
}

export async function getActiveNotifications(): Promise<NotificationItem[]> {
  try {
    return await invoke<NotificationItem[]>("get_active_notifications");
  } catch (e) {
    console.error("getActiveNotifications failed:", e);
    return [];
  }
}

export interface FocusPresencePayload {
  status: "normal" | "active" | "unknown";
}

export async function subscribeToFocusPresence(
  callback: (payload: FocusPresencePayload) => void
): Promise<UnlistenFn> {
  return await listen<FocusPresencePayload>("focus-presence", (event) => {
    callback(event.payload);
  });
}

export async function getFocusPresence(): Promise<FocusPresencePayload> {
  try {
    return await invoke<FocusPresencePayload>("get_focus_presence");
  } catch {
    return { status: "unknown" };
  }
}

export async function getMultiSessionState(): Promise<MultiSessionState> {
  try {
    return await invoke<MultiSessionState>("get_multi_session_state");
  } catch (e) {
    console.error("getMultiSessionState failed:", e);
    return { sessions: [] };
  }
}

export async function getAlbumArt(sessionId: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_album_art", { sessionId });
  } catch (e) {
    console.error("getAlbumArt failed:", e);
    return null;
  }
}

export async function selectMediaSession(sessionId: string): Promise<void> {
  try {
    await invoke("select_media_session", { sessionId });
  } catch (e) {
    console.error("selectMediaSession failed:", e);
  }
}

export async function mediaPlayPause(sessionId?: string): Promise<void> {
  try {
    await invoke("media_play_pause", { sessionId });
  } catch (e) {
    console.error("[MEDIA UI ERROR] mediaPlayPause failed:", e);
  }
}

export async function mediaNext(sessionId?: string): Promise<void> {
  try {
    await invoke("media_next", { sessionId });
  } catch (e) {
    console.error("[MEDIA UI ERROR] mediaNext failed:", e);
  }
}

export async function mediaPrev(sessionId?: string): Promise<void> {
  try {
    await invoke("media_prev", { sessionId });
  } catch (e) {
    console.error("[MEDIA UI ERROR] mediaPrev failed:", e);
  }
}

export async function mediaSeek(position: number, sessionId?: string): Promise<void> {
  try {
    await invoke("media_seek", { position, sessionId });
  } catch (e) {
    console.error("[MEDIA UI ERROR] mediaSeek failed:", e);
  }
}
