import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MediaSession, MultiSessionState } from '../../platform/media';
import { mediaPlayPause, mediaNext, mediaPrev, mediaSeek, selectMediaSession } from '../../platform';
import './MediaWidgetSurface.css';

interface Props {
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
}

export const MediaWidgetSurface: React.FC<Props> = ({ media, multiState }) => {
  const [isSeekingState, setIsSeekingState] = useState(false);

  // DOM Refs for direct 60fps updates without React re-renders
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const elapsedTimeLabelRef = useRef<HTMLSpanElement>(null);

  // Clock-based position tracking state refs
  const basePositionRef = useRef<number>(media?.position ?? 0);
  const syncTimestampRef = useRef<number>(performance.now());
  const isPlayingRef = useRef<boolean>(media?.isPlaying ?? false);
  const durationRef = useRef<number>(media?.duration ?? 0);
  const lastRenderedSecRef = useRef<number>(-1);
  const mediaIdRef = useRef<string | undefined>(media?.id);

  // Seeking generation token & timeout safety refs
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

  // Update clock state refs whenever media props update from authoritative events
  useEffect(() => {
    if (!media) return;

    const trackChanged = mediaIdRef.current !== media.id;
    mediaIdRef.current = media.id;

    if (trackChanged) {
      basePositionRef.current = media.position ?? 0;
      syncTimestampRef.current = performance.now();
      isPlayingRef.current = media.isPlaying;
      durationRef.current = media.duration ?? 0;
      lastRenderedSecRef.current = -1;
      isSeekingRef.current = false;
      setIsSeekingState(false);
      return;
    }

    if (!isSeekingRef.current) {
      if (media.position !== undefined) {
        basePositionRef.current = media.position;
        syncTimestampRef.current = performance.now();
      }
      isPlayingRef.current = media.isPlaying;
      durationRef.current = media.duration ?? 0;
    }
  }, [media?.id, media?.position, media?.isPlaying, media?.duration]);

  // Single persistent 60fps RAF loop updating only progressFillRef & elapsedTimeLabelRef
  useEffect(() => {
    let animFrameId: number;

    const renderLoop = () => {
      const duration = durationRef.current;
      let currentPos = basePositionRef.current;

      if (isSeekingRef.current && seekPosRef.current !== null) {
        currentPos = seekPosRef.current;
      } else if (isPlayingRef.current && duration > 0) {
        const elapsed = (performance.now() - syncTimestampRef.current) / 1000;
        currentPos = Math.min(duration, Math.max(0, basePositionRef.current + elapsed));
      }

      // 1. Update progress bar fill directly in DOM at 60fps
      if (progressFillRef.current && duration > 0) {
        const percent = Math.min(100, Math.max(0, (currentPos / duration) * 100));
        progressFillRef.current.style.width = `${percent}%`;
      } else if (progressFillRef.current) {
        progressFillRef.current.style.width = '0%';
      }

      // 2. Update formatted time text label only on second boundaries (low frequency)
      const currentSec = Math.floor(currentPos);
      if (currentSec !== lastRenderedSecRef.current && elapsedTimeLabelRef.current) {
        lastRenderedSecRef.current = currentSec;
        elapsedTimeLabelRef.current.textContent = formatTime(currentPos);
      }

      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [formatTime]);

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
    }

    // Safety timeout: auto-release seeking state after 2 seconds to prevent being stuck forever
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      if (seekGenTokenRef.current === token && isSeekingRef.current) {
        isSeekingRef.current = false;
        seekPosRef.current = null;
        setIsSeekingState(false);
      }
    }, 2000);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    const pos = calculatePositionFromEvent(e);
    if (pos !== null) {
      seekPosRef.current = pos;
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
      basePositionRef.current = finalPos;
      syncTimestampRef.current = performance.now();
      mediaSeek(finalPos, media.id);
    }

    const currentToken = seekGenTokenRef.current;
    setTimeout(() => {
      if (seekGenTokenRef.current === currentToken) {
        isSeekingRef.current = false;
        seekPosRef.current = null;
        setIsSeekingState(false);
      }
    }, 150);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    isSeekingRef.current = false;
    seekPosRef.current = null;
    setIsSeekingState(false);
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

  const evaluateSessionScore = (s: MediaSession): number => {
    let score = 0;
    if (s.title && s.title.trim().length > 0) score += 3;
    if (s.artist && s.artist.trim().length > 0) score += 2;
    if (s.albumArtBase64) score += 3;
    if (s.isPlaying) score += 4;
    if (s.canPlayPause) score += 1;
    if (s.canGoNext || s.canGoPrev) score += 1;
    return score;
  };

  const allSessions = multiState?.sessions || [];
  const usefulSessions = allSessions
    .filter((s) => evaluateSessionScore(s) >= 3)
    .sort((a, b) => evaluateSessionScore(b) - evaluateSessionScore(a));

  const selectedId = multiState?.selectedSessionId || media.id;

  return (
    <div className="media-widget-surface" onClick={(e) => e.stopPropagation()}>
      <div className="media-info-layout">
        <AnimatePresence mode="popLayout">
          {media.albumArtBase64 ? (
            <motion.div
              layoutId="media-art"
              key={media.albumArtBase64}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.25 }}
              className="media-art-container"
            >
              <img 
                src={`data:image/jpeg;base64,${media.albumArtBase64}`} 
                alt="Album Art" 
                className="media-art"
              />
            </motion.div>
          ) : (
            <motion.div layoutId="media-art" className="media-art-container fallback" key="fallback">
              <div className="music-note-icon">🎵</div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="media-details">
          <motion.div layoutId="media-text-container" className="media-text">
            <AnimatePresence mode="wait">
              <motion.h3 
                key={displayTitle}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="media-title"
              >
                {displayTitle}
              </motion.h3>
            </AnimatePresence>

            {displayArtist && (
              <AnimatePresence mode="wait">
                <motion.p 
                  key={displayArtist}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.15 }}
                  className="media-artist"
                >
                  {displayArtist}
                </motion.p>
              </AnimatePresence>
            )}
          </motion.div>

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
            <div className="media-time-labels">
              <span ref={elapsedTimeLabelRef}>{formatTime(media.position)}</span>
              <span>{formatTime(media.duration)}</span>
            </div>
          </div>

          <div className="media-controls">
            <button 
              className="media-btn" 
              onClick={(e) => { e.stopPropagation(); mediaPrev(media.id); }}
              disabled={!media.canGoPrev}
              aria-label="Previous track"
              data-no-drag="true"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="icon"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button 
              className="media-btn play-pause" 
              onClick={(e) => { e.stopPropagation(); mediaPlayPause(media.id); }}
              disabled={!media.canPlayPause}
              aria-label={media.isPlaying ? "Pause" : "Play"}
              data-no-drag="true"
            >
              <AnimatePresence mode="wait" initial={false}>
                {media.isPlaying ? (
                  <motion.svg 
                    key="pause"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 450, damping: 25 }}
                    viewBox="0 0 24 24" 
                    fill="currentColor" 
                    className="icon"
                  >
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </motion.svg>
                ) : (
                  <motion.svg 
                    key="play"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 450, damping: 25 }}
                    viewBox="0 0 24 24" 
                    fill="currentColor" 
                    className="icon"
                  >
                    <path d="M8 5v14l11-7z"/>
                  </motion.svg>
                )}
              </AnimatePresence>
            </button>
            <button 
              className="media-btn" 
              onClick={(e) => { e.stopPropagation(); mediaNext(media.id); }}
              disabled={!media.canGoNext}
              aria-label="Next track"
              data-no-drag="true"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="icon"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>

          {usefulSessions.length > 1 && (
            <div className="session-switcher-bottom" data-no-drag="true">
              {usefulSessions.map((sess) => {
                const isSelected = sess.id === selectedId;
                return (
                  <div
                    key={sess.id}
                    className={`session-item-clean ${isSelected ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectMediaSession(sess.id);
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
