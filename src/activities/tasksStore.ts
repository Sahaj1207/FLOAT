import { useSyncExternalStore } from "react";

/** A simple local to-do list, stored only on this PC. */
export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

const STORAGE_KEY = "float_tasks_v1";
const MAX_TASKS = 200;

function load(): Task[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.id === "string" && typeof t.title === "string")
      .map((t) => ({ id: t.id, title: t.title, done: !!t.done, createdAt: Number(t.createdAt) || 0 }));
  } catch {
    return [];
  }
}

let tasks: Task[] = load();
const listeners = new Set<() => void>();

function set(next: Task[]) {
  tasks = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Storage full or unavailable; keep the in-memory list.
  }
  listeners.forEach((l) => l());
}

export const taskList = {
  add(title: string) {
    const trimmed = title.trim().slice(0, 200);
    if (!trimmed) return;
    const task: Task = { id: crypto.randomUUID(), title: trimmed, done: false, createdAt: Date.now() };
    set([task, ...tasks].slice(0, MAX_TASKS));
  },
  toggle(id: string) {
    set(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  },
  remove(id: string) {
    set(tasks.filter((t) => t.id !== id));
  },
  clearDone() {
    set(tasks.filter((t) => !t.done));
  },
};

export function useTasks(): Task[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => tasks
  );
}
