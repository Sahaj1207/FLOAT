import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { timer, TimerMode, useTimerState } from "../../activities/timerStore";
import { TimerReadout } from "./Timer";
import "./TimerView.css";

const PRESETS = [1, 5, 10, 15, 25, 45];
const CUSTOM_KEY = "float_timer_custom_v1";
const MAX_MINUTES = 23 * 60 + 59;

/** The last custom duration, so it's one tap away next time. */
function loadCustom(): { min: number; sec: number } {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "");
    if (Number.isFinite(v.min) && Number.isFinite(v.sec)) return { min: v.min, sec: v.sec };
  } catch {
    // No saved value yet.
  }
  return { min: 20, sec: 0 };
}

const digits = (value: string, max: number) => {
  const n = parseInt(value.replace(/\D/g, "").slice(-4) || "0", 10);
  return Math.min(max, n);
};

/** Timer / stopwatch: one big readout. Type any duration, or tap a preset. */
export const TimerView: React.FC = () => {
  const state = useTimerState();
  const [mode, setMode] = useState<TimerMode>(state.active ? state.mode : "timer");
  const [custom, setCustom] = useState(loadCustom);
  const minRef = useRef<HTMLInputElement>(null);
  const shown = state.active ? state.mode : mode;

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch {
      // Not persisted; still usable this session.
    }
  }, [custom]);

  const customMs = (custom.min * 60 + custom.sec) * 1000;
  const startCustom = () => {
    if (customMs > 0) timer.start(customMs);
  };

  return (
    <div className="view timer-view">
      <div className="view-header">
        <div className="segmented" role="tablist" aria-label="Mode">
          {(["timer", "stopwatch"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={shown === m}
              className={shown === m ? "active" : ""}
              disabled={state.active && state.mode !== m}
              onClick={(e) => {
                e.stopPropagation();
                setMode(m);
              }}
              data-no-drag="true"
            >
              {m === "timer" ? "Timer" : "Stopwatch"}
            </button>
          ))}
        </div>
      </div>

      <div className="timer-stage">
        {state.active ? (
          <>
            <TimerReadout state={state} className="timer-big" />
            <div className="timer-actions">
              <button
                type="button"
                className="round-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  timer.reset(shown);
                }}
                data-no-drag="true"
                aria-label="Reset"
              >
                <RotateCcw size={16} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="round-btn primary"
                onClick={(e) => {
                  e.stopPropagation();
                  if (state.running) timer.pause();
                  else timer.resume();
                }}
                data-no-drag="true"
                aria-label={state.running ? "Pause" : "Resume"}
              >
                {state.running ? (
                  <Pause size={18} fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play size={18} fill="currentColor" strokeWidth={0} />
                )}
              </button>
            </div>
          </>
        ) : shown === "timer" ? (
          <>
            {/* The readout is the editor: type minutes and seconds, Enter starts. */}
            <form
              className="timer-edit"
              onSubmit={(e) => {
                e.preventDefault();
                startCustom();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) minRef.current?.select();
              }}
            >
              <input
                ref={minRef}
                className="timer-big"
                inputMode="numeric"
                aria-label="Minutes"
                value={custom.min}
                onChange={(e) => setCustom({ ...custom, min: digits(e.target.value, MAX_MINUTES) })}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: `${Math.max(1, String(custom.min).length)}ch` }}
                data-no-drag="true"
              />
              <span className="timer-big colon">:</span>
              <input
                className="timer-big"
                inputMode="numeric"
                aria-label="Seconds"
                value={String(custom.sec).padStart(2, "0")}
                onChange={(e) => setCustom({ ...custom, sec: digits(e.target.value.slice(-2), 59) })}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: "2ch" }}
                data-no-drag="true"
              />
              <button
                type="submit"
                className="round-btn primary timer-start"
                disabled={customMs === 0}
                data-no-drag="true"
                aria-label="Start timer"
              >
                <Play size={18} fill="currentColor" strokeWidth={0} />
              </button>
            </form>
            <div className="timer-chips">
              {PRESETS.map((min) => (
                <button
                  key={min}
                  type="button"
                  className="chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    timer.start(min * 60_000);
                  }}
                  data-no-drag="true"
                >
                  {min} min
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="timer-big idle">0:00.0</span>
            <div className="timer-actions">
              <button
                type="button"
                className="round-btn primary"
                onClick={(e) => {
                  e.stopPropagation();
                  timer.startStopwatch();
                }}
                data-no-drag="true"
                aria-label="Start stopwatch"
              >
                <Play size={18} fill="currentColor" strokeWidth={0} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TimerView;
