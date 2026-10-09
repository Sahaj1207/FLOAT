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
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

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

export interface VolumeState {
  /** 0..1 */
  level: number;
  muted: boolean;
}

export async function getVolume(): Promise<VolumeState | null> {
  try {
    return await invoke<VolumeState | null>("get_volume");
  } catch {
    return null;
  }
}

/** Nudge system volume by delta (-1..1); returns the new state. */
export async function changeVolume(delta: number): Promise<VolumeState | null> {
  try {
    return await invoke<VolumeState | null>("change_volume", { delta });
  } catch {
    return null;
  }
}

export async function toggleMute(): Promise<VolumeState | null> {
  try {
    return await invoke<VolumeState | null>("toggle_mute");
  } catch {
    return null;
  }
}

/** Fires when the system volume changes (including hardware volume keys). */
export async function subscribeToVolumeChanged(
  callback: (state: VolumeState) => void
): Promise<UnlistenFn> {
  return await listen<VolumeState>("volume-changed", (event) => callback(event.payload));
}

export interface PowerPayload {
  percent: number;
  charging: boolean;
  /** This change crossed a low-battery threshold while discharging. */
  low: boolean;
}

/** Battery level and charging state, or null on machines without a battery. */
export async function getPowerState(): Promise<PowerPayload | null> {
  try {
    return await invoke<PowerPayload | null>("get_power_state");
  } catch {
    return null;
  }
}

/** Fires on plug / unplug and when crossing 20% / 10% on battery. */
export async function subscribeToPower(callback: (payload: PowerPayload) => void): Promise<UnlistenFn> {
  return await listen<PowerPayload>("power-changed", (event) => callback(event.payload));
}

export interface PrivacyState {
  /** Name of an app using the microphone / camera, or null. */
  microphone: string | null;
  camera: string | null;
}

export async function getPrivacyState(): Promise<PrivacyState> {
  try {
    return await invoke<PrivacyState>("get_privacy_state");
  } catch {
    return { microphone: null, camera: null };
  }
}

export async function subscribeToPrivacy(callback: (state: PrivacyState) => void): Promise<UnlistenFn> {
  return await listen<PrivacyState>("privacy-changed", (event) => callback(event.payload));
}

export async function setVolume(level: number): Promise<VolumeState | null> {
  try {
    return await invoke<VolumeState | null>("set_volume", { level });
  } catch {
    return null;
  }
}

/** Built-in display brightness 0-100, or null if it can't be controlled. */
export async function getBrightness(): Promise<number | null> {
  try {
    return await invoke<number | null>("get_brightness");
  } catch {
    return null;
  }
}

export async function setBrightness(level: number): Promise<void> {
  try {
    await invoke("set_brightness", { level: Math.round(level) });
  } catch (e) {
    console.error("setBrightness failed:", e);
  }
}

/** Fires when brightness changes (including the brightness keys). */
export async function subscribeToBrightness(callback: (level: number) => void): Promise<UnlistenFn> {
  return await listen<number>("brightness-changed", (event) => callback(event.payload));
}

export interface ConnectivityState {
  wifi: { available: boolean; on: boolean; ssid: string | null; signal: number | null };
  bluetooth: { available: boolean; on: boolean; devices: string[] };
  /** Name of a non-Wi-Fi internet connection (e.g. Ethernet). */
  wired: string | null;
}

export async function getConnectivity(): Promise<ConnectivityState | null> {
  try {
    return await invoke<ConnectivityState>("get_connectivity");
  } catch {
    return null;
  }
}

/** Turn a radio on or off. Rejects with a message if Windows refuses. */
export async function setRadio(kind: "wifi" | "bluetooth", on: boolean): Promise<ConnectivityState> {
  return await invoke<ConnectivityState>("set_radio", { kind, on });
}

export async function subscribeToConnectivity(
  callback: (state: ConnectivityState) => void
): Promise<UnlistenFn> {
  return await listen<ConnectivityState>("connectivity-changed", (event) => callback(event.payload));
}

/** Fires when a Bluetooth device connects or disconnects. */
export async function subscribeToBluetoothDevice(
  callback: (event: { name: string; connected: boolean }) => void
): Promise<UnlistenFn> {
  return await listen<{ name: string; connected: boolean }>("bluetooth-device", (event) => callback(event.payload));
}

export type SettingsPage = "network-wifi" | "bluetooth" | "sound" | "quiethours" | "batterysaver";

export async function openSettingsPage(page: SettingsPage): Promise<void> {
  try {
    await invoke("open_settings_page", { page });
  } catch (e) {
    console.error("openSettingsPage failed:", e);
  }
}

export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number;
  text: string;
}

/** Synced lyrics from LRCLIB (network). Only call when the user opted in. */
export async function getLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricLine[] | null> {
  try {
    return await invoke<LyricLine[] | null>("get_lyrics", { title, artist, album, duration });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Clipboard history                                                   */
/* ------------------------------------------------------------------ */

export interface ClipboardEntry {
  id: number;
  /** Unix ms when copied. */
  at: number;
  kind: "text" | "image";
  text?: string;
  /** base64 PNG thumbnail for images. */
  thumb?: string;
  width?: number;
  height?: number;
}

export async function getClipboardHistory(): Promise<ClipboardEntry[]> {
  try {
    return await invoke<ClipboardEntry[]>("get_clipboard_history");
  } catch {
    return [];
  }
}

export async function copyClipboardEntry(id: number): Promise<boolean> {
  try {
    await invoke("copy_clipboard_entry", { id });
    return true;
  } catch (e) {
    console.error("copyClipboardEntry failed:", e);
    return false;
  }
}

export async function removeClipboardEntry(id: number): Promise<ClipboardEntry[]> {
  try {
    return await invoke<ClipboardEntry[]>("remove_clipboard_entry", { id });
  } catch {
    return [];
  }
}

export async function clearClipboardHistory(): Promise<void> {
  try {
    await invoke("clear_clipboard_history");
  } catch {
    // Not in a Tauri context
  }
}

export async function setClipboardHistoryEnabled(enabled: boolean): Promise<void> {
  try {
    await invoke("set_clipboard_history_enabled", { enabled });
  } catch {
    // Not in a Tauri context
  }
}

export async function subscribeToClipboard(callback: (entries: ClipboardEntry[]) => void): Promise<UnlistenFn> {
  return await listen<ClipboardEntry[]>("clipboard-changed", (event) => callback(event.payload));
}

/* ------------------------------------------------------------------ */
/*  File shelf                                                          */
/* ------------------------------------------------------------------ */

export interface ShelfItem {
  path: string;
  name: string;
  isDir: boolean;
}

async function shelfCall(cmd: string, args?: Record<string, unknown>): Promise<ShelfItem[]> {
  try {
    return await invoke<ShelfItem[]>(cmd, args);
  } catch (e) {
    console.error(`${cmd} failed:`, e);
    return [];
  }
}

export const getShelf = () => shelfCall("get_shelf");
export const addToShelf = (paths: string[]) => shelfCall("add_to_shelf", { paths });
export const removeFromShelf = (path: string) => shelfCall("remove_from_shelf", { path });
export const clearShelf = () => shelfCall("clear_shelf");

export async function openShelfItem(path: string, reveal = false): Promise<void> {
  try {
    await invoke("open_shelf_item", { path, reveal });
  } catch (e) {
    console.error("openShelfItem failed:", e);
  }
}

export async function getShelfThumbnail(path: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_shelf_thumbnail", { path });
  } catch {
    return null;
  }
}

/** Start a native drag of a shelf file out to other apps. */
export async function dragShelfItemOut(path: string): Promise<void> {
  try {
    const icon = await invoke<string | null>("shelf_drag_icon", { path });
    await startDrag({ item: [path], icon: icon ?? "" });
  } catch (e) {
    console.error("dragShelfItemOut failed:", e);
  }
}

export type FileDragEvent =
  | { type: "enter" | "over"; paths?: string[] }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };

/** OS file drags over the island window. */
export async function subscribeToFileDrag(callback: (event: FileDragEvent) => void): Promise<UnlistenFn> {
  try {
    return await getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "drop") callback({ type: "drop", paths: p.paths });
      else if (p.type === "leave") callback({ type: "leave" });
      else callback({ type: p.type, paths: "paths" in p ? p.paths : undefined });
    });
  } catch {
    return () => {};
  }
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
