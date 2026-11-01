import { useSyncExternalStore } from "react";
import { saveToDisk } from "../services/persist";

/**
 * Pinned snippets: text you paste often (an email address, a signature, an
 * address). Unlike clipboard history, which lives in memory only, these are
 * kept on this PC until you unpin them.
 */
export interface Snippet {
  id: string;
  text: string;
  createdAt: number;
}

const KEY = "float_snippets_v1";
const MAX_LENGTH = 20_000;

function load(): Snippet[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s) => s && typeof s.id === "string" && typeof s.text === "string")
        .map((s) => ({ id: s.id, text: s.text, createdAt: Number(s.createdAt) || 0 }));
    }
  } catch {
    // Start empty.
  }
  return [];
}

let snippets: Snippet[] = load();
const listeners = new Set<() => void>();

function set(next: Snippet[]) {
  snippets = next;
  try {
    const json = JSON.stringify(snippets);
    localStorage.setItem(KEY, json);
    saveToDisk(KEY, json);
  } catch {
    // Not persisted this time.
  }
  listeners.forEach((l) => l());
}

export const snippetList = {
  /** Pin text (no duplicates); the newest pin goes first. */
  pin(text: string) {
    const value = text.slice(0, MAX_LENGTH);
    if (!value.trim()) return;
    set([{ id: crypto.randomUUID(), text: value, createdAt: Date.now() }, ...snippets.filter((s) => s.text !== value)]);
  },
  unpin(id: string) {
    set(snippets.filter((s) => s.id !== id));
  },
  /** Unpin by content (for toggling a clipboard item). */
  unpinText(text: string) {
    set(snippets.filter((s) => s.text !== text));
  },
  isPinned: (text: string) => snippets.some((s) => s.text === text),
  all: () => snippets,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useSnippets = (): Snippet[] => useSyncExternalStore(subscribe, () => snippets);
