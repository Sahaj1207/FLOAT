import { useSyncExternalStore } from "react";
import { listen, emit } from "@tauri-apps/api/event";

/**
 * Custom shortcuts: your own one-tap buttons at the top of Controls.
 * Kept on this PC; Settings > Shortcuts creates and orders them.
 */
export type ShortcutKind = "app" | "url" | "path" | "command";

export type ShortcutCommand = "dark" | "light" | "lock" | "sleep" | "mic" | "focus25" | "focus50" | "copytext" | "recyclebin";

export interface CustomShortcut {
  id: string;
  name: string;
  kind: ShortcutKind;
  /** AUMID, URL, path, or a ShortcutCommand. */
  target: string;
  /** Button colour. */
  color: string;
}

export const COMMANDS: { id: ShortcutCommand; name: string }[] = [
  { id: "dark", name: "Dark mode" },
  { id: "light", name: "Light mode" },
  { id: "focus25", name: "Focus 25 min" },
  { id: "focus50", name: "Focus 50 min" },
  { id: "copytext", name: "Copy text from screen" },
  { id: "mic", name: "Mute microphone" },
  { id: "lock", name: "Lock screen" },
  { id: "sleep", name: "Sleep" },
  { id: "recyclebin", name: "Empty Recycle Bin" },
];

export const COLORS = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#ffd60a", "#30d158", "#64d2ff", "#8e8e93"];

export const MAX_SHORTCUTS = 8;
const KEY = "float_shortcuts_v1";

// A useful start that shows what's possible; everything can be removed.
const STARTER: CustomShortcut[] = [
  { id: "starter-dark", name: "Dark mode", kind: "command", target: "dark", color: "#5e5ce6" },
  { id: "starter-focus", name: "Focus 25", kind: "command", target: "focus25", color: "#bf5af2" },
  { id: "starter-text", name: "Copy text", kind: "command", target: "copytext", color: "#0a84ff" },
  { id: "starter-lock", name: "Lock", kind: "command", target: "lock", color: "#8e8e93" },
];

function load(): CustomShortcut[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return STARTER;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && typeof s.target === "string" && ["app", "url", "path", "command"].includes(s.kind));
    }
  } catch {
    // Fall through to the starter set.
  }
  return STARTER;
}

let shortcuts: CustomShortcut[] = load();
const listeners = new Set<() => void>();
const WINDOW_ID = Math.random().toString(36).slice(2);

function set(next: CustomShortcut[], broadcast = true) {
  shortcuts = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(shortcuts));
  } catch {
    // Not persisted this time.
  }
  listeners.forEach((l) => l());
  // Settings and the island are separate windows.
  if (broadcast) emit("float-shortcuts-changed", WINDOW_ID).catch(() => {});
}

listen<string>("float-shortcuts-changed", (e) => {
  if (e.payload === WINDOW_ID) return;
  shortcuts = load();
  listeners.forEach((l) => l());
}).catch(() => {});

export const shortcutList = {
  add(s: Omit<CustomShortcut, "id">) {
    if (shortcuts.length >= MAX_SHORTCUTS) return;
    set([...shortcuts, { ...s, id: crypto.randomUUID() }]);
  },
  update(id: string, patch: Partial<CustomShortcut>) {
    set(shortcuts.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  },
  remove(id: string) {
    set(shortcuts.filter((s) => s.id !== id));
  },
  move(id: string, delta: number) {
    const i = shortcuts.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= shortcuts.length) return;
    const next = [...shortcuts];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  },
  all: () => shortcuts,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useShortcuts = (): CustomShortcut[] => useSyncExternalStore(subscribe, () => shortcuts);
