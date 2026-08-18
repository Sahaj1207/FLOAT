import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MediaSession, MultiSessionState } from '../../platform/media';
import { mediaPlayPause, mediaNext, mediaPrev, mediaSeek, selectMediaSession } from '../../platform';
import { mediaTimeline } from './mediaTimeline';
import './MediaWidgetSurface.css';

interface Props {
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
  onSelectSession?: (sessionId: string) => void;
}

export const MediaWidgetSurface: React.FC<Props> = ({ media, multiState, onSelectSession }) => {
  const [isSeekingState, setIsSeekingState] = useState(false);

  // DOM Refs for direct updates from central MediaTimelineManager
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const elapsedTimeLabelRef = useRef<HTMLSpanElement>(null);

  const durationRef = useRef<number>(media?.duration ?? 0);
  const isSeekingRef = useRef<boolean>(false);
  const seekPosRef = useRef<number | null>(null);
  const seekGenTokenRef = useRef<number>(0);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatTime = useCallback((seconds?: number) => {
    if (seconds === undefined || isNaN(seconds) || seconds < 0) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Sync media duration ref
  useEffect(() => {
    durationRef.current = media?.duration ?? 0;
  }, [media?.duration]);

  // Register DOM elements to central timeline manager
  useEffect(() => {
    const fillEl = progressFillRef.current;
    const labelEl = elapsedTimeLabelRef.current;
    if (fillEl) mediaTimeline.registerFill(fillEl);
    if (labelEl) mediaTimeline.registerLabel(labelEl);

    return () => {
      if (fillEl) mediaTimeline.unregisterFill(fillEl);
      if (labelEl) mediaTimeline.unregisterLabel(labelEl);
    };
  }, [media?.id]);

  // Calculate target position from pointer event
  const calculatePositionFromEvent = (e: React.PointerEvent | PointerEvent): number | null => {
    if (!progressBarRef.current || durationRef.current <= 0) return null;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    return (clickX / rect.width) * durationRef.current;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!media || durationRef.current <= 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    const token = ++seekGenTokenRef.current;
    isSeekingRef.current = true;
    setIsSeekingState(true);

    const pos = calculatePositionFromEvent(e);
    if (pos !== null) {
      seekPosRef.current = pos;
      mediaTimeline.setSeeking(true, pos);
    }

    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      if (seekGenTokenRef.current === token && isSeekingRef.current) {
        isSeekingRef.current = false;
        seekPosRef.current = null;
        setIsSeekingState(false);
        mediaTimeline.setSeeking(false, null);
      }
    }, 2000);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    const pos = calculatePositionFromEvent(e);
    if (pos !== null) {
      seekPosRef.current = pos;
      mediaTimeline.setSeeking(true, pos);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was lost
    }

    const finalPos = calculatePositionFromEvent(e) ?? seekPosRef.current;

    if (finalPos !== null && media) {
      mediaTimeline.commitSeek(finalPos);
      mediaSeek(finalPos, media.id);
    }

    isSeekingRef.current = false;
    seekPosRef.current = null;
    setIsSeekingState(false);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    isSeekingRef.current = false;
    seekPosRef.current = null;
    setIsSeekingState(false);
    mediaTimeline.setSeeking(false, null);
  };

  if (!media || !media.hasMedia) {
    return (
      <div className="media-widget-surface empty" onClick={(e) => e.stopPropagation()}>
        <p>No media playing</p>
      </div>
    );
  }

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
  const displayArtist = media.artist || (media.title ? cleanSourceName(media.source) : undefined);

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
  const prevTrackKeyRef = useRef<string>('');

  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLHeadingElement>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const [marqueeShift, setMarqueeShift] = useState(0);
  const [marqueeDuration, setMarqueeDuration] = useState(10);

  useEffect(() => {
    if (prevTrackKeyRef.current && prevTrackKeyRef.current !== trackKey && trackKey !== 'no-media') {
      console.log(`[TRACK ANIMATION] start session=${media.id} track=${displayTitle}`);
      const timer = setTimeout(() => {
        console.log(`[TRACK ANIMATION] complete session=${media.id} track=${displayTitle}`);
      }, 220);
      return () => clearTimeout(timer);
    }
    prevTrackKeyRef.current = trackKey;
  }, [trackKey, media.id, displayTitle]);

  // Overflow measurement effect: runs only when track identity or displayed title changes
  useEffect(() => {
    setIsTitleOverflowing(false);
    setMarqueeShift(0);

    const timer = setTimeout(() => {
      const container = titleContainerRef.current;
      const text = titleTextRef.current;
      if (!container || !text) return;

      const containerW = container.clientWidth;
      const textW = text.scrollWidth;
      const diff = textW - containerW;

      if (diff > 4) {
        const GAP = 40; // 40px gap between copies
        const shift = textW + GAP;
        const speed = 25; // 25 px/sec
        const duration = Math.max(6, shift / speed);

        setIsTitleOverflowing(true);
        setMarqueeShift(shift);
        setMarqueeDuration(duration);
      } else {
        setIsTitleOverflowing(false);
        setMarqueeShift(0);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [trackKey, displayTitle]);

  const allSessions = multiState?.sessions || [];

  return (
    <div className="media-widget-surface" onClick={(e) => e.stopPropagation()}>
      <div className="media-info-layout">
        <motion.div 
          layoutId="media-art" 
          className="media-art-container"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={trackKey}
              initial={{ opacity: 0.7, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="media-art-inner"
            >
              {media.albumArtBase64 ? (
                <img 
                  src={`data:image/jpeg;base64,${media.albumArtBase64}`} 
                  alt="Album Art" 
                  className="media-art"
                />
              ) : (
                <div className="media-art-fallback">🎵</div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <div className="media-details">
          <motion.div layoutId="media-text-container" className="media-text">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={trackKey}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="media-text-inner"
              >
                <div 
                  className={`media-title-wrapper ${isTitleOverflowing ? 'is-overflowing' : ''}`}
                  ref={titleContainerRef}
                  style={{
                    '--marquee-shift': `-${marqueeShift}px`,
                    '--marquee-duration': `${marqueeDuration}s`,
                  } as React.CSSProperties}
                >
                  <div className={`media-title-track ${isTitleOverflowing ? 'marquee' : ''}`}>
                    <h3 
                      className="media-title"
                      ref={titleTextRef}
                      title={displayTitle}
                    >
                      {displayTitle}
                    </h3>
                    {isTitleOverflowing && (
                      <span className="media-title-duplicate" aria-hidden="true">
                        {displayTitle}
                      </span>
                    )}
                  </div>
                </div>

                {displayArtist ? (
                  <p className="media-artist" title={displayArtist}>
                    {displayArtist}
                  </p>
                ) : (
                  <p className="media-artist media-artist-placeholder" aria-hidden="true">&nbsp;</p>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          <div className="media-progress-wrapper">
            <div 
              className={`media-progress-container ${isSeekingState ? 'seeking' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              data-no-drag="true"
            >
              <div className="media-progress-bar" ref={progressBarRef}>
                <div 
                  className="media-progress-fill" 
                  ref={progressFillRef}
                  style={{ width: '0%' }}
                >
                  <div className="media-progress-thumb" />
                </div>
              </div>
            </div>
            <div className="media-time-labels">
              <span ref={elapsedTimeLabelRef}>{formatTime(media.position)}</span>
              <span>{formatTime(media.duration)}</span>
            </div>
          </div>

          <div className="media-controls">
            <button 
              className="media-btn" 
              onClick={(e) => { 
                e.stopPropagation(); 
                console.log("[MEDIA CONTROL] prev session=" + media.id);
                mediaPrev(media.id); 
              }}
              disabled={!media.canGoPrev}
              aria-label="Previous track"
              data-no-drag="true"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="icon"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button 
              className="media-btn play-pause" 
              onClick={(e) => { 
                e.stopPropagation(); 
                console.log("[MEDIA CONTROL] play_pause session=" + media.id);
                mediaPlayPause(media.id); 
              }}
              disabled={!media.canPlayPause}
              aria-label={media.isPlaying ? "Pause" : "Play"}
              data-no-drag="true"
            >
              <span className="media-btn-icon-wrapper">
                <AnimatePresence mode="popLayout" initial={false}>
                  {media.isPlaying ? (
                    <motion.svg 
                      key="pause"
                      initial={{ scale: 0.75, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.75, opacity: 0 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      viewBox="0 0 24 24" 
                      fill="currentColor" 
                      className="icon"
                    >
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </motion.svg>
                  ) : (
                    <motion.svg 
                      key="play"
                      initial={{ scale: 0.75, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.75, opacity: 0 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      viewBox="0 0 24 24" 
                      fill="currentColor" 
                      className="icon"
                    >
                      <path d="M8 5v14l11-7z"/>
                    </motion.svg>
                  )}
                </AnimatePresence>
              </span>
            </button>
            <button 
              className="media-btn" 
              onClick={(e) => { 
                e.stopPropagation(); 
                console.log("[MEDIA CONTROL] next session=" + media.id);
                mediaNext(media.id); 
              }}
              disabled={!media.canGoNext}
              aria-label="Next track"
              data-no-drag="true"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="icon"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>

          {allSessions.length > 1 && (
            <div className="session-switcher-bottom" data-no-drag="true">
              {allSessions.map((sess) => {
                const isSelected = sess.id === media.id;
                return (
                  <div
                    key={sess.id}
                    className={`session-item-clean ${isSelected ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log("[SESSION SELECT] clicked dot id=" + sess.id);
                      if (onSelectSession) {
                        onSelectSession(sess.id);
                      } else {
                        selectMediaSession(sess.id);
                      }
                    }}
                    data-no-drag="true"
                  >
                    <span className="session-dot-clean" />
                    <span>{cleanSourceName(sess.source)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
