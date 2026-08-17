import React from "react";
import { motion } from "framer-motion";
import { MediaSession } from "../../platform/media";
import { MediaWidgetPill } from "./MediaWidgetPill";
import "./FloatPill.css";

interface FloatPillProps {
  onClick: () => void;
  media: MediaSession | null;
  sessionCount?: number;
  isPreview?: boolean;
}

export const FloatPill: React.FC<FloatPillProps> = ({ onClick, media, sessionCount = 1, isPreview = false }) => {
  return (
    <motion.div 
      layoutId="island-glass"
      className={`float-pill-container island-glass ${isPreview ? 'preview-active' : ''}`}
      onClick={onClick}
    >
      <div className="float-pill-content">
        {media?.hasMedia ? (
          <MediaWidgetPill media={media} sessionCount={sessionCount} isPreview={isPreview} />
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
