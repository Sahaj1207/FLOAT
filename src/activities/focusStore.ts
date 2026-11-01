import { useSyncExternalStore } from "react";
import { saveToDisk } from "../services/persist";

/**
 * Focus Sessions: work on one task for a set time, then take a break.
 *
 * Kept outside React (like the timer) so it survives the panel closing, and
 * saved to localStorage so a restart mid-session resumes it. All times are
 * wall-clock, so nothing drifts while unrendered. Stats stay on this PC.
 */

export type FocusPhase = "idle" | "focus" | "break";

export interface FocusState {
  phase: FocusPhase;
  /** What the session is for; taskId links it to the Tasks list. */
  title: string;
  taskId: string | null;
  /** Length of the current phase. */
  durationMs: number;
  /** Running: when the phase ends. */
  endsAt: number;
  /** Paused: time left at the pause. */
  remainingMs: number;
  paused: boolean;
  /** Why it paused: the user, or a meeting starting. */
  pausedFor: "user" | "meeting" | null;
  /** When the current uninterrupted run began; focus time since then isn't counted yet. */
  startedAt: number;
}

export interface FocusStats {
  /** "YYYY-MM-DD" -> totals for that day. */
  days: Record<string, { focusMs: number; sessions: number }>;
}

const STATE_KEY = "float_focus_v1";
const STATS_KEY = "float_focus_stats_v1";

const idle: FocusState = {
  phase: "idle",
  title: "",
  taskId: null,
  durationMs: 0,
  endsAt: 0,
  remainingMs: 0,
  paused: false,
  pausedFor: null,
  startedAt: 0,
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    const json = JSON.stringify(value);
    localStorage.setItem(key, json);
    saveToDisk(key, json);
  } catch {
    // Not persisted; the session still runs.
  }
}

let state: FocusState = load(STATE_KEY, idle);
let stats: FocusStats = load(STATS_KEY, { days: {} });
const listeners = new Set<() => void>();
const endListeners = new Set<(ended: FocusState) => void>();
let endTimer: ReturnType<typeof setTimeout> | null = null;

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function set(next: FocusState) {
  state = next;
  save(STATE_KEY, state);
  listeners.forEach((l) => l());
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  if (state.phase !== "idle" && !state.paused) {
    endTimer = setTimeout(phaseEnded, Math.max(0, state.endsAt - Date.now()));
  }
}

function addFocusTime(ms: number, completed: boolean) {
  if (ms <= 0 && !completed) return;
  const key = dayKey();
  const day = stats.days[key] ?? { focusMs: 0, sessions: 0 };
  stats = {
    days: {
      ...stats.days,
      [key]: { focusMs: day.focusMs + Math.max(0, ms), sessions: day.sessions + (completed ? 1 : 0) },
    },
  };
  save(STATS_KEY, stats);
  listeners.forEach((l) => l());
}

/** Focus time in the current run that hasn't been counted yet. */
function elapsedThisRun(s: FocusState): number {
  if (s.phase !== "focus" || s.paused) return 0;
  return Math.max(0, Math.min(Date.now(), s.endsAt) - s.startedAt);
}

function phaseEnded() {
  const ended = state;
  if (ended.phase === "focus") addFocusTime(elapsedThisRun(ended), true);
  // Stay on the finished phase, at zero, until the user picks what's next.
  set({ ...ended, paused: true, remainingMs: 0, pausedFor: null, startedAt: Date.now() });
  endListeners.forEach((l) => l(ended));
}

export function focusRemaining(s: FocusState = state): number {
  if (s.phase === "idle") return 0;
  return s.paused ? s.remainingMs : Math.max(0, s.endsAt - Date.now());
}

/** True when a phase has run out and is waiting for Done / More / Break. */
export const focusFinished = (s: FocusState = state) => s.phase !== "idle" && s.paused && s.remainingMs === 0;

const MIN = 60_000;

export const focus = {
  start(title: string, minutes: number, taskId: string | null = null) {
    const durationMs = Math.round(minutes * MIN);
    const now = Date.now();
    set({ ...idle, phase: "focus", title: title.trim() || "Focus", taskId, durationMs, endsAt: now + durationMs, remainingMs: durationMs, startedAt: now });
  },
  pause(reason: "user" | "meeting" = "user") {
    if (state.phase === "idle" || state.paused) return;
    addFocusTime(elapsedThisRun(state), false);
    set({ ...state, paused: true, pausedFor: reason, remainingMs: focusRemaining() });
  },
  resume() {
    if (state.phase === "idle" || !state.paused || state.remainingMs === 0) return;
    const now = Date.now();
    // Time before the pause was already counted.
    set({ ...state, paused: false, pausedFor: null, endsAt: now + state.remainingMs, startedAt: now });
  },
  /** Add minutes (also revives a finished phase). */
  extend(minutes: number) {
    if (state.phase === "idle") return;
    const add = minutes * MIN;
    const now = Date.now();
    addFocusTime(elapsedThisRun(state), false);
    const remaining = focusRemaining() + add;
    set({ ...state, paused: false, pausedFor: null, durationMs: state.durationMs + add, endsAt: now + remaining, remainingMs: remaining, startedAt: now });
  },
  startBreak(minutes: number) {
    const durationMs = minutes * MIN;
    const now = Date.now();
    set({ ...state, phase: "break", paused: false, pausedFor: null, durationMs, endsAt: now + durationMs, remainingMs: durationMs, startedAt: now });
  },
  /** End the session now; unfinished focus time still counts. */
  stop() {
    if (state.phase === "focus" && !focusFinished()) addFocusTime(elapsedThisRun(state), false);
    set(idle);
  },
  /** Called with the phase that just ran out. */
  onPhaseEnd(listener: (ended: FocusState) => void) {
    endListeners.add(listener);
    return () => {
      endListeners.delete(listener);
    };
  },
};

// Resume a session saved before a restart (or let it end if it ran out).
set(state);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useFocusState = (): FocusState => useSyncExternalStore(subscribe, () => state);
export const useFocusStats = (): FocusStats => useSyncExternalStore(subscribe, () => stats);

/** Focus time and sessions today, and how many days in a row had a session. */
export function todaySummary(s: FocusStats = stats) {
  const today = s.days[dayKey()] ?? { focusMs: 0, sessions: 0 };
  let streak = 0;
  const d = new Date();
  // Today counts once it has a session; otherwise the streak runs to yesterday.
  if (!today.sessions) d.setDate(d.getDate() - 1);
  while ((s.days[dayKey(d)]?.sessions ?? 0) > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { focusMs: today.focusMs, sessions: today.sessions, streak };
}

/** "1h 20m", "25m". */
export function formatDuration(ms: number): string {
  const mins = Math.round(ms / MIN);
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** Break length after a session: 5 min, or 10 after a long one. */
export const breakMinutesFor = (durationMs: number) => (durationMs >= 45 * MIN ? 10 : 5);
