import React, { useEffect, useRef } from "react";
import { setVisualizerActive, subscribeToAudioLevels, AudioLevelsPayload } from "../../platform";
import "./AudioBars.css";

/* Shared levels feed: one event subscription and one native capture for all
   mounted equalizers, released when the last one unmounts. */
type Listener = (payload: AudioLevelsPayload) => void;
const listeners = new Set<Listener>();
let unlisten: Promise<() => void> | null = null;

function retain(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    setVisualizerActive(true);
    unlisten = subscribeToAudioLevels((payload) => listeners.forEach((l) => l(payload)));
  }
}

function release(listener: Listener) {
  listeners.delete(listener);
  if (listeners.size === 0) {
    setVisualizerActive(false);
    unlisten?.then((fn) => fn());
    unlisten = null;
  }
}

/** Live levels for any visual (also starts and stops the native capture). */
export function useLevelsFeed(active: boolean, listener: Listener) {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    if (!active) return;
    const forward: Listener = (payload) => ref.current(payload);
    retain(forward);
    return () => release(forward);
  }, [active]);
}

// Keep a gentle idle wave while the output is silent (e.g. muted), so a
// playing track never looks frozen.
const SILENT_FALLBACK_MS = 1200;
// Spring per bar: quick to rise, settles without jitter between level updates.
const STIFFNESS = 320;
const DAMPING = 24;
// A paused bar rests as a dot: its height equals its width.
const REST = 0;

interface AudioBarsProps {
  /** Container class carrying the size. */
  className: string;
  /** Class for each bar; index (1-based) is appended as `${barClass}-${i}`. */
  barClass: string;
  count?: number;
  /** Paused: the bars settle into dots. */
  playing?: boolean;
}

/**
 * A waveform of rounded bars that grow from the middle, driven by live output
 * audio. Each bar follows its frequency band on a spring, so it moves fluidly
 * between level updates; the outer bars are a little shorter, giving the wave
 * its shape.
 */
export const AudioBars: React.FC<AudioBarsProps> = ({ className, barClass, count = 5, playing = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const state = useRef({
    heights: new Array<number>(count).fill(REST),
    velocities: new Array<number>(count).fill(0),
    levels: [] as number[],
    lastLive: -Infinity,
  });

  useEffect(() => {
    const s = state.current;
    if (s.heights.length !== count) {
      s.heights = new Array<number>(count).fill(REST);
      s.velocities = new Array<number>(count).fill(0);
    }

    const listener: Listener = ({ levels, silent }) => {
      if (silent) return;
      s.levels = levels;
      s.lastLive = performance.now();
    };
    if (playing) retain(listener);

    let frame = 0;
    let last = performance.now();
    const container = containerRef.current;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const live = playing && now - s.lastLive < SILENT_FALLBACK_MS;
      const bands = s.levels.length;
      let moving = false;
      for (let i = 0; i < count; i++) {
        // Shape: centre bars reach full height, edges about two thirds.
        const fromCentre = count > 1 ? Math.abs(i - (count - 1) / 2) / ((count - 1) / 2) : 0;
        const envelope = 1 - 0.32 * fromCentre * fromCentre;
        let target = REST;
        if (live && bands > 0) {
          const band = s.levels[Math.round((i * (bands - 1)) / Math.max(1, count - 1))] ?? 0;
          target = band * envelope;
        } else if (playing) {
          // Idle wave: slow, offset sines.
          target = (0.35 + 0.25 * Math.sin(now / 260 + i * 1.3) + 0.12 * Math.sin(now / 110 + i * 2.1)) * envelope;
        }
        const h = s.heights[i];
        const v = s.velocities[i] + ((target - h) * STIFFNESS - s.velocities[i] * DAMPING) * dt;
        s.velocities[i] = v;
        s.heights[i] = Math.max(0, Math.min(1, h + v * dt));
        if (Math.abs(target - s.heights[i]) > 0.002 || Math.abs(v) > 0.01) moving = true;
        const bar = barsRef.current[i];
        if (bar) bar.style.setProperty("--level", s.heights[i].toFixed(3));
      }
      container?.classList.toggle("audio-paused", !playing);
      // Paused and settled: stop until playback resumes.
      if (playing || moving) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      if (playing) release(listener);
    };
  }, [playing, count]);

  return (
    <div ref={containerRef} className={`audio-bars ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className={`${barClass} ${barClass}-${i + 1}`}
        />
      ))}
    </div>
  );
};

export default AudioBars;
