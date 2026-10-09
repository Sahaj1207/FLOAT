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

// Keep the built-in animation while the output is silent (e.g. muted), so a
// playing track never looks frozen.
const SILENT_FALLBACK_MS = 1200;
const MIN_HEIGHT = 18; // percent

interface AudioBarsProps {
  /** Container class carrying the size and the fallback keyframe animation. */
  className: string;
  /** Class for each bar; index (1-based) is appended as `${barClass}-${i}`. */
  barClass: string;
  count?: number;
}

/** Equalizer bars driven by live output audio, falling back to CSS animation. */
export const AudioBars: React.FC<AudioBarsProps> = ({ className, barClass, count = 3 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    // Start on the fallback animation until real audio arrives.
    let silentSince = -Infinity;
    const listener: Listener = ({ levels, silent }) => {
      const container = containerRef.current;
      if (!container) return;
      const now = performance.now();
      if (!silent) silentSince = now;
      const live = now - silentSince < SILENT_FALLBACK_MS;
      container.classList.toggle("audio-live", live);
      if (!live) return;
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const level = levels[i % levels.length] ?? 0;
        bar.style.height = `${MIN_HEIGHT + level * (100 - MIN_HEIGHT)}%`;
      });
    };
    retain(listener);
    return () => release(listener);
  }, []);

  return (
    <div ref={containerRef} className={className}>
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
