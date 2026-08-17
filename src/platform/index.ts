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

/**
 * Resize the native window to match the current island dimensions.
 */
export async function syncWindowSize(
  width: number,
  height: number
): Promise<void> {
  try {
    await invoke("sync_window_size", { width, height });
  } catch (e) {
    console.error("syncWindowSize failed:", e);
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

export async function getMultiSessionState(): Promise<MultiSessionState> {
  try {
    return await invoke<MultiSessionState>("get_multi_session_state");
  } catch (e) {
    console.error("getMultiSessionState failed:", e);
    return { sessions: [] };
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
