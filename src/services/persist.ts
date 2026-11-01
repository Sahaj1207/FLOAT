import { invoke } from "@tauri-apps/api/core";

/**
 * Your data on disk. Stores keep using localStorage as their fast, synchronous
 * copy; every change is also written (debounced) to a file by the native
 * side, which keeps a previous version and daily backups. At startup the
 * files win, so a cleared web profile never loses anything.
 */
const FILES: Record<string, string> = {
  float_settings_v1: "settings",
  float_tasks_v1: "tasks",
  float_notes_v1: "notes",
  float_snippets_v1: "snippets",
  float_focus_v1: "focus",
  float_focus_stats_v1: "focus-stats",
};

/** Copy the files into localStorage before any store reads it. */
export async function hydrateFromDisk(): Promise<void> {
  await Promise.all(
    Object.entries(FILES).map(async ([localKey, fileKey]) => {
      try {
        const onDisk = await invoke<string | null>("store_load", { key: fileKey });
        const local = localStorage.getItem(localKey);
        if (onDisk !== null) {
          if (onDisk !== local) localStorage.setItem(localKey, onDisk);
        } else if (local !== null) {
          // First run with files: move what's already here onto disk.
          await invoke("store_save", { key: fileKey, value: local });
        }
      } catch {
        // Not in Tauri, or the disk is unavailable: keep localStorage as is.
      }
    })
  );
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Mirror a localStorage write to disk (coalesced, so typing isn't a write per key). */
export function saveToDisk(localKey: string, value: string): void {
  const fileKey = FILES[localKey];
  if (!fileKey) return;
  const previous = pending.get(fileKey);
  if (previous) clearTimeout(previous);
  pending.set(
    fileKey,
    setTimeout(() => {
      pending.delete(fileKey);
      invoke("store_save", { key: fileKey, value }).catch(() => {});
    }, 400)
  );
}

/** Write anything still waiting (e.g. before the window closes). */
export function flushToDisk(): void {
  for (const [fileKey, timer] of pending) {
    clearTimeout(timer);
    const localKey = Object.keys(FILES).find((k) => FILES[k] === fileKey)!;
    const value = localStorage.getItem(localKey);
    if (value !== null) invoke("store_save", { key: fileKey, value }).catch(() => {});
  }
  pending.clear();
}

/** After an import: load the restored files, then reload every window. */
export async function reloadFromDisk(): Promise<void> {
  await hydrateFromDisk();
}
