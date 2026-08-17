import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MediaSession } from '../../platform/media';
import { mediaPlayPause } from '../../platform';
import { mediaTimeline } from './mediaTimeline';
import './MediaWidgetPill.css';

interface Props {
  media: MediaSession;
  sessionCount?: number;
  isPreview?: boolean;
}

export const MediaWidgetPill: React.FC<Props> = ({ media, sessionCount = 1, isPreview = false }) => {
  const fillRef = useRef<HTMLDivElement>(null);

  // Register preview progress bar element to central timeline manager
  useEffect(() => {
    const el = fillRef.current;
    if (isPreview && el) {
      mediaTimeline.registerFill(el);
    }
    return () => {
      if (el) {
        mediaTimeline.unregisterFill(el);
      }
    };
  }, [isPreview, media.id]);

  if (!media.hasMedia) return null;

  const cleanSourceName = (src?: string) => {
    if (!src) return "Media";
    if (src.toLowerCase().includes("spotify")) return "Spotify";
    if (src.toLowerCase().includes("chrome")) return "Chrome";
    if (src.toLowerCase().includes("edge")) return "Edge";
    if (src.toLowerCase().includes("vlc")) return "VLC";
    if (src.toLowerCase().includes("apple")) return "Apple Music";
    return src.split('.')[0] || "Media";
  };

  const displayTitle = media.title || media.album || cleanSourceName(media.source);

  return (
    <motion.div className="media-widget-pill">
      <motion.div 
        layoutId="media-art" 
        className={`media-pill-art-container ${!media.albumArtBase64 ? 'fallback' : ''} ${isPreview ? 'preview' : ''}`}
      >
        {media.albumArtBase64 ? (
          <img 
            src={`data:image/jpeg;base64,${media.albumArtBase64}`} 
            alt="Art" 
            className="media-pill-art"
          />
        ) : (
          <span>🎵</span>
        )}
      </motion.div>

      <motion.div layoutId="media-text-container" className="media-pill-text-container">
        <motion.span layoutId="media-title" className="media-pill-title">
          {displayTitle}
        </motion.span>
      </motion.div>

      <motion.div layoutId="media-indicator" className="media-pill-right">
        {sessionCount > 1 && (
          <span className="multi-session-badge" title={`${sessionCount} sessions active`}>
            ●{sessionCount}
          </span>
        )}

        {media.isPlaying ? (
          <div className="equalizer-bars">
            <span className="bar" />
            <span className="bar" />
            <span className="bar" />
          </div>
        ) : (
          <div className="music-dot" />
        )}
        
        <button 
          className="media-pill-control"
          onClick={(e) => {
            e.stopPropagation();
            console.log("[MEDIA CONTROL] play_pause session=" + media.id);
            mediaPlayPause(media.id);
          }}
          data-no-drag="true"
          aria-label={media.isPlaying ? "Pause" : "Play"}
        >
          <AnimatePresence mode="wait" initial={false}>
            {media.isPlaying ? (
              <motion.svg 
                key="pill-pause"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="pill-control-icon"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </motion.svg>
            ) : (
              <motion.svg 
                key="pill-play"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="pill-control-icon"
              >
                <path d="M8 5v14l11-7z"/>
              </motion.svg>
            )}
          </AnimatePresence>
        </button>
      </motion.div>

      {isPreview && media.duration && media.duration > 0 && (
        <div className="media-pill-progress-overlay">
          <div 
            ref={fillRef}
            className="media-pill-progress-fill" 
            style={{ width: '0%' }} 
          />
        </div>
      )}
    </motion.div>
  );
};
