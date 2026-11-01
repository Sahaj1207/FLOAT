import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Coffee, Flame, Pause, Play, Plus, RotateCcw, Square, Target } from "lucide-react";
import {
  breakMinutesFor,
  focus,
  focusFinished,
  focusRemaining,
  FocusState,
  formatDuration,
  todaySummary,
  useFocusState,
  useFocusStats,
} from "../../activities/focusStore";
import { formatTimer } from "../../activities/timerStore";
import { taskList, useTasks } from "../../activities/tasksStore";
import { openSettingsPage } from "../../platform";
import "./Focus.css";

const LENGTHS = [25, 50] as const;
const CUSTOM_KEY = "float_focus_custom_v1";
const swap = { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const };

/** Re-render every `ms` while `active`, for live countdowns. */
function useTick(active: boolean, ms = 500) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

/** Circular progress; the arc eases between ticks so it never steps. */
export const FocusRing: React.FC<{ state: FocusState; size: number; stroke?: number; children?: React.ReactNode }> = ({
  state,
  size,
  stroke = 3,
  children,
}) => {
  useTick(state.phase !== "idle" && !state.paused, 1000);
  const remaining = focusRemaining(state);
  const progress = state.durationMs > 0 ? 1 - remaining / state.durationMs : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`focus-ring ${state.phase}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="focus-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="focus-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
        />
      </svg>
      {children && <span className="focus-ring-inner">{children}</span>}
    </span>
  );
};

const stop = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  fn();
};

/** "Done" ticks the linked task off as well. */
function finishSession(state: FocusState) {
  if (state.taskId) taskList.complete(state.taskId);
  focus.stop();
}

// --- In the island -------------------------------------------------------------

/** Island content while a session runs, and the choice when it ends. */
export const FocusPill: React.FC<{ state: FocusState }> = ({ state }) => {
  const finished = focusFinished(state);
  useTick(!state.paused);
  const isBreak = state.phase === "break";

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {finished ? (
        <motion.div
          key="done"
          className="focus-pill"
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={swap}
        >
          {isBreak ? <Coffee className="focus-pill-icon break" strokeWidth={2.2} /> : <Target className="focus-pill-icon" strokeWidth={2.2} />}
          <span className="focus-pill-title">{isBreak ? "Break's over" : "Time's up"}</span>
          <span className="focus-pill-actions">
            {isBreak ? (
              <>
                <button type="button" className="focus-chip" onClick={stop(() => focus.stop())} data-no-drag="true">
                  Stop
                </button>
                <button
                  type="button"
                  className="focus-chip primary"
                  onClick={stop(() => focus.start(state.title, 25, state.taskId))}
                  data-no-drag="true"
                >
                  Focus again
                </button>
              </>
            ) : (
              <>
                <button type="button" className="focus-chip" onClick={stop(() => focus.extend(5))} data-no-drag="true" aria-label="Five more minutes">
                  +5
                </button>
                <button
                  type="button"
                  className="focus-chip"
                  onClick={stop(() => focus.startBreak(breakMinutesFor(state.durationMs)))}
                  data-no-drag="true"
                >
                  Break
                </button>
                <button type="button" className="focus-chip primary" onClick={stop(() => finishSession(state))} data-no-drag="true">
                  <Check size={12} strokeWidth={3} />
                  Done
                </button>
              </>
            )}
          </span>
        </motion.div>
      ) : (
        <motion.div
          key="running"
          className="focus-pill"
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={swap}
        >
          <FocusRing state={state} size={20} stroke={2.5} />
          <span className="focus-pill-title">{isBreak ? "Break" : state.title}</span>
          <span className={`focus-pill-time ${state.phase}`}>{formatTimer(focusRemaining(state))}</span>
          <button
            type="button"
            className={`focus-round sm ${state.phase}`}
            onClick={stop(() => (state.paused ? focus.resume() : focus.pause()))}
            data-no-drag="true"
            aria-label={state.paused ? "Resume" : "Pause"}
          >
            {state.paused ? <Play fill="currentColor" strokeWidth={0} /> : <Pause fill="currentColor" strokeWidth={0} />}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- In the panel ------------------------------------------------------------------

const TodayLine: React.FC = () => {
  const { focusMs, sessions, streak } = todaySummary(useFocusStats());
  return (
    <div className="focus-today">
      <span>
        <strong>{formatDuration(focusMs)}</strong> focused today
      </span>
      <span>
        <strong>{sessions}</strong> {sessions === 1 ? "session" : "sessions"}
      </span>
      {streak > 1 && (
        <span className="focus-streak">
          <Flame size={12} strokeWidth={2.4} />
          {streak}-day streak
        </span>
      )}
    </div>
  );
};

function loadCustom(): number {
  try {
    const v = Number(localStorage.getItem(CUSTOM_KEY));
    if (v >= 1 && v <= 240) return v;
  } catch {
    // No saved value.
  }
  return 40;
}

/** Pick what to work on and for how long, then start. */
const FocusSetup: React.FC = () => {
  const openTasks = useTasks().filter((t) => !t.done);
  const [title, setTitle] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [length, setLength] = useState<number | "custom">(25);
  const [custom, setCustom] = useState(loadCustom);
  const minutes = length === "custom" ? custom : length;

  const start = () => {
    if (length === "custom") {
      try {
        localStorage.setItem(CUSTOM_KEY, String(custom));
      } catch {
        // Not persisted.
      }
    }
    focus.start(title, minutes, taskId);
  };

  return (
    <form
      className="focus-setup"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <label className="focus-field">
        <Target size={15} strokeWidth={2.2} />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTaskId(null);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="What are you working on?"
          aria-label="What are you working on?"
          spellCheck={false}
          maxLength={120}
          data-no-drag="true"
        />
      </label>
      {openTasks.length > 0 && (
        <div className="focus-suggestions">
          {openTasks.slice(0, 3).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip focus-suggestion ${taskId === t.id ? "selected" : ""}`}
              onClick={() => {
                setTitle(t.title);
                setTaskId(t.id);
              }}
              data-no-drag="true"
              title={t.title}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
      <div className="focus-setup-row">
        <div className="segmented" role="radiogroup" aria-label="Length">
          {LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={length === m}
              className={length === m ? "active" : ""}
              onClick={() => setLength(m)}
              data-no-drag="true"
            >
              {m} min
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={length === "custom"}
            className={length === "custom" ? "active" : ""}
            onClick={() => setLength("custom")}
            data-no-drag="true"
          >
            Custom
          </button>
        </div>
        <AnimatePresence initial={false}>
          {length === "custom" && (
            <motion.label
              className="focus-custom"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            >
              <input
                inputMode="numeric"
                value={custom}
                onChange={(e) => setCustom(Math.min(240, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="Minutes"
                data-no-drag="true"
              />
              min
            </motion.label>
          )}
        </AnimatePresence>
        <button type="submit" className="focus-start" disabled={minutes < 1} data-no-drag="true">
          <Play size={13} fill="currentColor" strokeWidth={0} />
          Start focus
        </button>
      </div>
    </form>
  );
};

/** A running, paused or finished session. */
const FocusRunning: React.FC<{ state: FocusState }> = ({ state }) => {
  useTick(!state.paused, 250);
  const finished = focusFinished(state);
  const isBreak = state.phase === "break";
  const endsAt = new Date(Date.now() + focusRemaining(state)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const status = finished
    ? isBreak
      ? "Break's over"
      : "Time's up. Nice work"
    : state.paused
    ? state.pausedFor === "meeting"
      ? "Paused for your meeting"
      : "Paused"
    : isBreak
    ? `Break · back at ${endsAt}`
    : `Focusing · until ${endsAt}`;

  return (
    <div className="focus-running">
      <FocusRing state={state} size={96} stroke={5}>
        <span className="focus-ring-time">{formatTimer(focusRemaining(state))}</span>
      </FocusRing>
      <div className="focus-running-side">
        <span className="focus-running-title">{isBreak ? "Break" : state.title}</span>
        <span className="focus-running-status">{status}</span>
        <div className="focus-running-actions">
          {finished && !isBreak ? (
            <>
              <button type="button" className="focus-start" onClick={stop(() => finishSession(state))} data-no-drag="true">
                <Check size={14} strokeWidth={3} />
                Done
              </button>
              <button type="button" className="chip" onClick={stop(() => focus.startBreak(breakMinutesFor(state.durationMs)))} data-no-drag="true">
                {breakMinutesFor(state.durationMs)} min break
              </button>
              <button type="button" className="chip" onClick={stop(() => focus.extend(5))} data-no-drag="true">
                +5 min
              </button>
            </>
          ) : finished ? (
            <>
              <button type="button" className="focus-start" onClick={stop(() => focus.start(state.title, 25, state.taskId))} data-no-drag="true">
                <RotateCcw size={13} strokeWidth={2.6} />
                Focus again
              </button>
              <button type="button" className="chip" onClick={stop(() => focus.stop())} data-no-drag="true">
                Done for now
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`focus-round ${state.phase}`}
                onClick={stop(() => (state.paused ? focus.resume() : focus.pause()))}
                data-no-drag="true"
                aria-label={state.paused ? "Resume" : "Pause"}
              >
                {state.paused ? <Play fill="currentColor" strokeWidth={0} /> : <Pause fill="currentColor" strokeWidth={0} />}
              </button>
              <button type="button" className="chip" onClick={stop(() => focus.extend(5))} data-no-drag="true">
                <Plus size={12} strokeWidth={2.6} /> 5 min
              </button>
              <button type="button" className="chip" onClick={stop(() => focus.stop())} data-no-drag="true">
                <Square size={10} fill="currentColor" strokeWidth={0} /> End
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** The Focus segment of the Timer tab. */
export const FocusView: React.FC = () => {
  const state = useFocusState();
  return (
    <div className="focus-view">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.phase === "idle" ? "setup" : "running"}
          className="focus-stage"
          initial={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
          transition={swap}
        >
          {state.phase === "idle" ? <FocusSetup /> : <FocusRunning state={state} />}
        </motion.div>
      </AnimatePresence>
      <div className="focus-footer">
        <TodayLine />
        <button type="button" className="view-action" onClick={stop(() => openSettingsPage("notifications"))} data-no-drag="true" title="Windows can silence its own notifications too">
          Windows Do not disturb…
        </button>
      </div>
    </div>
  );
};
