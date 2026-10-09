import React, { useEffect, useState } from "react";
import { formatTimer, timer, timerValue, TimerState, useTimerState } from "../../activities/timerStore";
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
  <svg className={`timer-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
  </svg>
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
    <svg viewBox="0 0 24 24" fill="currentColor">
      {state.running ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5v14l11-7z" />}
    </svg>
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

const PRESETS = [1, 5, 10, 25];

/** Home widget: start presets, or control the running timer / stopwatch. */
export const TimerTile: React.FC = () => {
  const state = useTimerState();

  if (state.active) {
    return (
      <div className="home-tile timer-tile">
        <div className="timer-tile-head">
          <TimerIcon />
          <span>{state.mode === "timer" ? "Timer" : "Stopwatch"}</span>
        </div>
        <div className="timer-tile-row">
          <TimerReadout state={state} className="timer-tile-readout" />
          <PauseResume state={state} />
          <button
            type="button"
            className="timer-btn ghost"
            onClick={(e) => {
              e.stopPropagation();
              timer.reset();
            }}
            data-no-drag="true"
            aria-label="Reset"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-tile timer-tile">
      <div className="timer-tile-head">
        <TimerIcon />
        <span>Timer</span>
        <button
          type="button"
          className="timer-link"
          onClick={(e) => {
            e.stopPropagation();
            timer.startStopwatch();
          }}
          data-no-drag="true"
        >
          Stopwatch
        </button>
      </div>
      <div className="timer-presets">
        {PRESETS.map((min) => (
          <button
            key={min}
            type="button"
            className="timer-preset"
            onClick={(e) => {
              e.stopPropagation();
              timer.start(min * 60_000);
            }}
            data-no-drag="true"
          >
            {min}m
          </button>
        ))}
      </div>
    </div>
  );
};

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
