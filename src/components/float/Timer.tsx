import React, { useEffect, useState } from "react";
import { formatTimer, timer, timerValue, TimerState } from "../../activities/timerStore";
import { Pause, Play, Timer as TimerGlyph } from "lucide-react";
import "./Timer.css";

/** Live readout; ticks only while running. */
export const TimerReadout: React.FC<{ state: TimerState; className?: string }> = ({ state, className = "" }) => {
  const [, tick] = useState(0);
  const stopwatch = state.mode === "stopwatch";
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => tick((n) => n + 1), stopwatch ? 100 : 250);
    return () => clearInterval(id);
  }, [state.running, stopwatch]);
  return <span className={`timer-readout ${className}`}>{formatTimer(timerValue(state), stopwatch)}</span>;
};

export const TimerIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <TimerGlyph className={`timer-icon ${className}`} strokeWidth={2.2} />
);

const PauseResume: React.FC<{ state: TimerState; size?: "sm" | "md" }> = ({ state, size = "md" }) => (
  <button
    type="button"
    className={`timer-btn ${size}`}
    onClick={(e) => {
      e.stopPropagation();
      if (state.running) timer.pause();
      else timer.resume();
    }}
    data-no-drag="true"
    aria-label={state.running ? "Pause" : "Resume"}
  >
    {state.running ? <Pause fill="currentColor" strokeWidth={0} /> : <Play fill="currentColor" strokeWidth={0} />}
  </button>
);

/** Notch content while a timer or stopwatch runs. */
export const TimerPill: React.FC<{ state: TimerState }> = ({ state }) => (
  <div className="timer-pill">
    <TimerIcon />
    <span className="timer-pill-label">{state.mode === "timer" ? "Timer" : "Stopwatch"}</span>
    <TimerReadout state={state} className="timer-pill-readout" />
    <PauseResume state={state} size="sm" />
  </div>
);

/** A short, gentle three-note chime for a finished timer. */
export function playChime() {
  try {
    const ctx = new AudioContext();
    [880, 1108.73, 1318.51].forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // Audio unavailable; the visual alert still shows.
  }
}
