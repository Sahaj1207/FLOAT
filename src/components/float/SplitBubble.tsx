import React from "react";
import { motion } from "framer-motion";
import { Activity } from "../../activities/types";
import { useAlbumArt } from "./useAlbumArt";
import "./SplitBubble.css";

interface SplitBubbleProps {
  activity: Activity;
  size: number;
  gap: number;
  onClick: () => void;
}

/** Minimal view of the secondary activity, detached beside the pill. */
export const SplitBubble: React.FC<SplitBubbleProps> = ({ activity, size, gap, onClick }) => {
  return (
    <motion.button
      type="button"
      className="split-bubble"
      style={{ width: size, height: size, left: `calc(100% + ${gap}px)` }}
      initial={{ x: -(size + gap), scale: 0.4, opacity: 0 }}
      animate={{ x: 0, scale: 1, opacity: 1 }}
      exit={{ x: -(size + gap), scale: 0.4, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-no-drag="true"
      aria-label={activity.kind === "media" ? "Open media" : "Open activity"}
    >
      {activity.kind === "media" ? <MediaMinimal activity={activity} /> : <span className="split-bubble-dot" />}
    </motion.button>
  );
};

const MediaMinimal: React.FC<{ activity: Extract<Activity, { kind: "media" }> }> = ({ activity }) => {
  const art = useAlbumArt(activity.session);
  const playing = activity.session.isPlaying;
  return (
    <>
      {art && <img className="split-bubble-art" src={art} alt="" draggable={false} />}
      <span className={`split-bubble-eq ${playing ? "playing" : ""} ${art ? "over-art" : ""}`}>
        <span />
        <span />
        <span />
      </span>
    </>
  );
};

export default SplitBubble;
