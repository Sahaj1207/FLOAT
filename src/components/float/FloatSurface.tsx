import React from "react";
import { motion } from "framer-motion";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { MediaWidgetSurface } from "./MediaWidgetSurface";
import "./FloatSurface.css";

/**
 * FloatSurface — the expanded state of the FLOAT island.
 *
 * A larger rounded surface hosting media controls and multi-session switcher.
 */

interface FloatSurfaceProps {
  onCollapse: () => void;
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
}

export const FloatSurface: React.FC<FloatSurfaceProps> = ({ onCollapse, media, multiState }) => {
  return (
    <motion.div 
      layoutId="island-glass"
      className="float-surface-content island-glass"
      onClick={onCollapse}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button className="float-surface-header" onClick={onCollapse}>
        <div className="float-surface-handle" />
      </button>
      
      <div className="float-surface-body">
        {media?.hasMedia ? (
          <MediaWidgetSurface media={media} multiState={multiState} />
        ) : (
          <div style={{ padding: '20px', color: 'var(--float-text-secondary)', textAlign: 'center' }}>
            No media playing
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default FloatSurface;
