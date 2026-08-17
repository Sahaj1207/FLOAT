import React from "react";
import { motion } from "framer-motion";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { MediaWidgetSurface } from "./MediaWidgetSurface";
import "./FloatSurface.css";

interface FloatSurfaceProps {
  onCollapse: () => void;
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
  onSelectSession?: (sessionId: string) => void;
}

export const FloatSurface: React.FC<FloatSurfaceProps> = ({ onCollapse, media, multiState, onSelectSession }) => {
  return (
    <motion.div 
      layoutId="island-glass"
      className="float-surface-content island-glass"
    >
      <button 
        className="float-surface-header" 
        onClick={onCollapse}
        data-no-drag="true"
        aria-label="Collapse island"
      >
        <div className="float-surface-handle" />
      </button>
      
      <div className="float-surface-body">
        {media?.hasMedia ? (
          <MediaWidgetSurface media={media} multiState={multiState} onSelectSession={onSelectSession} />
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
