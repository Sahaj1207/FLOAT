import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getLyrics, LyricLine } from "../../platform";
import { MediaSession } from "../../platform/media";
import { loadSettings, subscribeToSettings } from "../../services/settings";
import { mediaTimeline } from "./mediaTimeline";
import "./Lyrics.css";

function useLyricsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => loadSettings().syncedLyrics);
  useEffect(() => subscribeToSettings((s) => setEnabled(s.syncedLyrics)), []);
  return enabled;
}

/** Index of the line being sung at `position` seconds, or -1 before the first. */
function lineAt(lines: LyricLine[], position: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * The current synced lyric line for the playing track. Renders nothing when
 * the (opt-in) setting is off or LRCLIB has no synced lyrics.
 */
export const CurrentLyric: React.FC<{ media: MediaSession }> = ({ media }) => {
  const enabled = useLyricsEnabled();
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const [index, setIndex] = useState(-1);
  const { title, artist, album, duration } = media;

  useEffect(() => {
    setLines(null);
    setIndex(-1);
    if (!enabled || !title || !artist) return;
    let cancelled = false;
    getLyrics(title, artist, album, duration).then((result) => {
      if (!cancelled) setLines(result);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, title, artist, album, duration]);

  useEffect(() => {
    if (!lines) return;
    // Slight lead so a line appears as it starts, not after.
    const update = () => setIndex(lineAt(lines, mediaTimeline.getCurrentPosition() + 0.25));
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [lines]);

  if (!enabled || !lines) return null;
  const text = index >= 0 ? lines[index].text : "";

  return (
    <div className="lyric-line" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {text || "♪"}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};
