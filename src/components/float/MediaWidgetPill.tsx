import React, { useEffect, useRef, useState } from 'react';
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

  // Stable track identity computation (session ID + normalized track metadata)
  const getTrackKey = (session: MediaSession | null | undefined): string => {
    if (!session || !session.hasMedia) return 'no-media';
    const normTitle = (session.title || '').trim().toLowerCase();
    const normArtist = (session.artist || '').trim().toLowerCase();
    const normAlbum = (session.album || '').trim().toLowerCase();
    const fallback = (!normTitle && !normArtist && !normAlbum) ? (session.source || '').trim().toLowerCase() : '';
    return `${session.id}::${normTitle}::${normArtist}::${normAlbum}::${fallback}`;
  };

  const trackKey = getTrackKey(media);

  const pillTitleContainerRef = useRef<HTMLDivElement>(null);
  const pillTitleTextRef = useRef<HTMLSpanElement>(null);
  const [isPillTitleOverflowing, setIsPillTitleOverflowing] = useState(false);
  const [pillMarqueeShift, setPillMarqueeShift] = useState(0);
  const [pillMarqueeDuration, setPillMarqueeDuration] = useState(10);

  useEffect(() => {
    setIsPillTitleOverflowing(false);
    setPillMarqueeShift(0);

    const timer = setTimeout(() => {
      const container = pillTitleContainerRef.current;
      const text = pillTitleTextRef.current;
      if (!container || !text) return;

      const containerW = container.clientWidth;
      const textW = text.scrollWidth;
      const diff = textW - containerW;

      if (diff > 4) {
        const GAP = 36; // 36px gap between copies
        const shift = textW + GAP;
        const speed = 22; // 22 px/sec
        const duration = Math.max(6, shift / speed);

        setIsPillTitleOverflowing(true);
        setPillMarqueeShift(shift);
        setPillMarqueeDuration(duration);
      } else {
        setIsPillTitleOverflowing(false);
        setPillMarqueeShift(0);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [trackKey, displayTitle]);

  return (
    <motion.div className="media-widget-pill">
      <motion.div 
        layoutId="media-art" 
        className={`media-pill-art-container ${isPreview ? 'preview' : ''}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={trackKey}
            initial={{ opacity: 0.7, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="media-pill-art-inner"
          >
            {media.albumArtBase64 ? (
              <img 
                src={`data:image/jpeg;base64,${media.albumArtBase64}`} 
                alt="Art" 
                className="media-pill-art"
              />
            ) : (
              <span className="media-pill-fallback">🎵</span>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <motion.div layoutId="media-text-container" className="media-pill-text-container">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={trackKey}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`media-pill-title-wrapper ${isPillTitleOverflowing ? 'is-overflowing' : ''}`}
            ref={pillTitleContainerRef}
            style={{
              '--marquee-shift': `-${pillMarqueeShift}px`,
              '--marquee-duration': `${pillMarqueeDuration}s`,
            } as React.CSSProperties}
          >
            <div className={`media-pill-title-track ${isPillTitleOverflowing ? 'marquee' : ''}`}>
              <span
                ref={pillTitleTextRef}
                className="media-pill-title"
                title={displayTitle}
              >
                {displayTitle}
              </span>
              {isPillTitleOverflowing && (
                <span className="media-pill-title-duplicate" aria-hidden="true">
                  {displayTitle}
                </span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <motion.div layoutId="media-indicator" className="media-pill-right">
        {sessionCount > 1 && (
          <span className="multi-session-badge" title={`${sessionCount} sessions active`}>
            ●{sessionCount}
          </span>
        )}

        <div className="media-pill-indicator-slot">
          <AnimatePresence mode="wait" initial={false}>
            {media.isPlaying ? (
              <motion.div 
                key="equalizer"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="equalizer-bars"
              >
                <span className="bar bar-1" />
                <span className="bar bar-2" />
                <span className="bar bar-3" />
              </motion.div>
            ) : (
              <motion.div 
                key="music-dot"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="music-dot" 
              />
            )}
          </AnimatePresence>
        </div>
        
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
          <span className="media-pill-icon-wrapper">
            <AnimatePresence mode="popLayout" initial={false}>
              {media.isPlaying ? (
                <motion.svg 
                  key="pill-pause"
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.75, opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  viewBox="0 0 24 24" 
                  fill="currentColor" 
                  className="pill-control-icon"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </motion.svg>
              ) : (
                <motion.svg 
                  key="pill-play"
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.75, opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  viewBox="0 0 24 24" 
                  fill="currentColor" 
                  className="pill-control-icon"
                >
                  <path d="M8 5v14l11-7z"/>
                </motion.svg>
              )}
            </AnimatePresence>
          </span>
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
