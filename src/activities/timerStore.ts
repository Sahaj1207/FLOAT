import { useSyncExternalStore } from "react";

/**
 * Timer / stopwatch state, kept outside React so it survives the panel
 * closing. Times are wall-clock based, so nothing drifts while unrendered.
 */
export type TimerMode = "timer" | "stopwatch";

export interface TimerState {
  mode: TimerMode;
  running: boolean;
  /** Timer: total length. */
  durationMs: number;
  /** Running timer: when it ends. Running stopwatch: when it (re)started. */
  anchor: number;
  /** Paused: remaining (timer) or elapsed (stopwatch) at pause time. */
  frozenMs: number;
  /** True once a timer has been started or a stopwatch has run. */
  active: boolean;
}

const initial: TimerState = { mode: "timer", running: false, durationMs: 0, anchor: 0, frozenMs: 0, active: false };

let state: TimerState = initial;
let finishTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const finishListeners = new Set<(durationMs: number) => void>();

function set(next: TimerState) {
  state = next;
  listeners.forEach((l) => l());
  if (finishTimer) {
    clearTimeout(finishTimer);
    finishTimer = null;
  }
  if (state.mode === "timer" && state.running) {
    finishTimer = setTimeout(finish, Math.max(0, state.anchor - Date.now()));
  }
}

function finish() {
  const { durationMs } = state;
  set({ ...initial, mode: "timer" });
  finishListeners.forEach((l) => l(durationMs));
}

/** Remaining (timer) or elapsed (stopwatch) milliseconds right now. */
export function timerValue(s: TimerState = state): number {
  if (!s.running) return s.frozenMs;
  return s.mode === "timer" ? Math.max(0, s.anchor - Date.now()) : Date.now() - s.anchor;
}

export const timer = {
  start(durationMs: number) {
    set({ mode: "timer", running: true, durationMs, anchor: Date.now() + durationMs, frozenMs: durationMs, active: true });
  },
  startStopwatch() {
    set({ mode: "stopwatch", running: true, durationMs: 0, anchor: Date.now(), frozenMs: 0, active: true });
  },
  pause() {
    if (!state.running) return;
    set({ ...state, running: false, frozenMs: timerValue() });
  },
  resume() {
    if (state.running || !state.active) return;
    const anchor = state.mode === "timer" ? Date.now() + state.frozenMs : Date.now() - state.frozenMs;
    set({ ...state, running: true, anchor });
  },
  reset(mode: TimerMode = state.mode) {
    set({ ...initial, mode });
  },
  /** Called with the timer's length when it reaches zero. */
  onFinish(listener: (durationMs: number) => void) {
    finishListeners.add(listener);
    return () => {
      finishListeners.delete(listener);
    };
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTimerState(): TimerState {
  return useSyncExternalStore(subscribe, () => state);
}

/** "4:05", "1:02:03", or with tenths for the stopwatch under an hour. */
export function formatTimer(ms: number, tenths = false): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  const base = `${m}:${pad(s)}`;
  return tenths ? `${base}.${Math.floor((ms % 1000) / 100)}` : base;
}
