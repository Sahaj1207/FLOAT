import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { mediaPlayPause } from "../../platform";
import { MediaSession } from "../../platform/media";

// Both shapes are two four-point polygons, so the icon morphs point to point:
// the pause bars slide together into the two halves of the play triangle.
const PAUSE = ["M6 5 L10 5 L10 19 L6 19 Z", "M14 5 L18 5 L18 19 L14 19 Z"];
const PLAY = ["M8 5 L13.5 8.5 L13.5 15.5 L8 19 Z", "M13.5 8.5 L19 12 L19 12 L13.5 15.5 Z"];

const MORPH = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.7 };

/** Play / pause glyph that morphs between the two states. */
export const PlayPauseIcon: React.FC<{ playing: boolean; className?: string }> = ({ playing, className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    {[0, 1].map((i) => (
      <motion.path key={i} initial={false} animate={{ d: playing ? PAUSE[i] : PLAY[i] }} transition={MORPH} />
    ))}
  </svg>
);

// How long to trust the tap before giving up on the player confirming it.
const CONFIRM_TIMEOUT_MS = 1500;

/**
 * Playing state that flips the moment you tap, instead of waiting for the
 * player to report back, then follows the player again once it agrees (or
 * after a timeout if it never does).
 */
export function usePlayPause(media: MediaSession | null): [boolean, () => void] {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actual = !!media?.isPlaying;

  useEffect(() => {
    if (optimistic !== null && actual === optimistic) setOptimistic(null);
  }, [actual, optimistic]);

  // A different session or track starts fresh.
  useEffect(() => setOptimistic(null), [media?.id]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const toggle = useCallback(() => {
    if (!media) return;
    const next = !(optimistic ?? actual);
    setOptimistic(next);
    mediaPlayPause(media.id);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOptimistic(null), CONFIRM_TIMEOUT_MS);
  }, [media, optimistic, actual]);

  return [optimistic ?? actual, toggle];
}
