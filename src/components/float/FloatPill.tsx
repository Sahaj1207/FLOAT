import React from "react";
import { motion } from "framer-motion";
import { MediaSession } from "../../platform/media";
import { MediaWidgetPill } from "./MediaWidgetPill";
import "./FloatPill.css";

/**
 * FloatPill — the collapsed state of the FLOAT island.
 *
 * A small rounded pill showing the FLOAT indicator.
 * Rendered inside the shared motion container in FloatShell,
 * so it animates as part of the same morphing surface.
 */

interface FloatPillProps {
  onClick: () => void;
  media: MediaSession | null;
  sessionCount?: number;
}

export const FloatPill: React.FC<FloatPillProps> = ({ onClick, media, sessionCount = 1 }) => {
  return (
    <motion.div 
      layoutId="island-glass"
      className="float-pill-container island-glass"
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="float-pill-content">
        {media?.hasMedia ? (
          <MediaWidgetPill media={media} sessionCount={sessionCount} />
        ) : (
          <>
            <div className="float-pill-indicator" />
            <span className="float-pill-label">FLOAT</span>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default FloatPill;
