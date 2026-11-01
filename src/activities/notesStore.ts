import { useSyncExternalStore } from "react";
import { saveToDisk } from "../services/persist";

/** Quick Notes: plain-text scratchpad notes, saved on this PC only. */
export interface Note {
  id: string;
  text: string;
  updatedAt: number;
}

const KEY = "float_notes_v1";

function load(): Note[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(parsed)) {
      return parsed
        .filter((n) => n && typeof n.id === "string" && typeof n.text === "string")
        .map((n) => ({ id: n.id, text: n.text, updatedAt: Number(n.updatedAt) || 0 }));
    }
  } catch {
    // Start empty.
  }
  return [];
}

let notes: Note[] = load();
const listeners = new Set<() => void>();

function set(next: Note[]) {
  notes = next;
  try {
    const json = JSON.stringify(notes);
    localStorage.setItem(KEY, json);
    saveToDisk(KEY, json);
  } catch {
    // Not persisted this time.
  }
  listeners.forEach((l) => l());
}

/** First line, for titles and search. */
export const noteTitle = (n: Note) => n.text.trim().split("\n")[0].slice(0, 80) || "New note";

export const noteList = {
  /** A new empty note at the top; returns its id. */
  add(text = ""): string {
    const note: Note = { id: crypto.randomUUID(), text, updatedAt: Date.now() };
    set([note, ...notes]);
    return note.id;
  },
  update(id: string, text: string) {
    set(notes.map((n) => (n.id === id ? { ...n, text, updatedAt: Date.now() } : n)));
  },
  remove(id: string) {
    set(notes.filter((n) => n.id !== id));
  },
  /** Drop notes left empty (e.g. a new note never typed in). */
  prune() {
    if (notes.some((n) => !n.text.trim())) set(notes.filter((n) => n.text.trim()));
  },
  all: () => notes,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useNotes = (): Note[] => useSyncExternalStore(subscribe, () => notes);
