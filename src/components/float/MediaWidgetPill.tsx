import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MediaSession } from '../../platform/media';
import { PlayPauseIcon, usePlayPause } from './PlayPause';
import { mediaTimeline } from './mediaTimeline';
import { useAlbumArt } from './useAlbumArt';
import { AudioBars } from './AudioBars';
import './MediaWidgetPill.css';

interface Props {
  media: MediaSession;
  sessionCount?: number;
  isPreview?: boolean;
}

export const MediaWidgetPill: React.FC<Props> = ({ media, sessionCount = 1, isPreview = false }) => {
  const albumArt = useAlbumArt(media);
  const [playing, togglePlay] = usePlayPause(media);
  const fillRef = useRef<HTMLDivElement>(null);

  // Register preview progress bar element to central timeline manager
  useEffect(() => {
    const el = fillRef.current;
    if (el) {
      mediaTimeline.registerFill(el);
    }
    return () => {
      if (el) {
        mediaTimeline.unregisterFill(el);
      }
    };
  }, [media.id]);

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
    <motion.div className={`media-widget-pill ${media.hasMedia && playing ? 'presence-active' : ''}`}>
      <motion.div 
        layoutId="media-art" 
        className={`media-pill-art-container ${isPreview ? 'preview' : ''}`}
      >
        <div className="media-pill-art-frame">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={trackKey}
              initial={{ opacity: 0.7, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="media-pill-art-inner"
            >
              {albumArt ? (
                <img 
                  src={albumArt} 
                  alt="Art" 
                  className="media-pill-art"
                />
              ) : (
                <span className="media-pill-fallback">🎵</span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
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

        <AudioBars className="equalizer-bars" barClass="bar" count={5} playing={playing} />

        <button
          className="media-pill-control"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          data-no-drag="true"
          aria-label={playing ? "Pause" : "Play"}
        >
          <span className="media-pill-icon-wrapper">
            <PlayPauseIcon playing={playing} className="pill-control-icon" />
          </span>
        </button>
      </motion.div>

      {(media.duration ?? 0) > 0 && (
        <div className={`media-pill-progress-overlay ${isPreview ? 'preview-visible' : ''}`}>
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
