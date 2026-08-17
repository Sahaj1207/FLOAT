import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { FloatPill } from "./FloatPill";
import { FloatSurface } from "./FloatSurface";
import {
  startWindowDrag,
  subscribeToMultiSessionState,
  subscribeToSessionPosition,
  syncWindowSize,
  getMultiSessionState,
} from "../../platform";
import { MediaSession, MultiSessionState, SessionPositionPayload } from "../../platform/media";
import "./FloatShell.css";

type ShellState = "collapsed" | "expanded";

const PILL_WIDTH = 240;
const PILL_HEIGHT = 48;
const SURFACE_WIDTH = 460;
const SURFACE_HEIGHT = 330;

const PILL_BOUNDS_W = PILL_WIDTH + 40;
const PILL_BOUNDS_H = PILL_HEIGHT + 40;
const SURFACE_BOUNDS_W = SURFACE_WIDTH + 40;
const SURFACE_BOUNDS_H = SURFACE_HEIGHT + 60;

const springTransition = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};

const FloatShell: React.FC = () => {
  const [state, setState] = useState<ShellState>("collapsed");
  const [multiState, setMultiState] = useState<MultiSessionState | null>(null);
  
  const isExpanded = state === "expanded";
  const manualExpandRef = useRef(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expand = useCallback(() => {
    manualExpandRef.current = true;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    syncWindowSize(SURFACE_BOUNDS_W, SURFACE_BOUNDS_H);
    setState("expanded");
  }, []);

  const collapse = useCallback(() => {
    manualExpandRef.current = false;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setState("collapsed");
    setTimeout(() => {
      syncWindowSize(PILL_BOUNDS_W, PILL_BOUNDS_H);
    }, 250);
  }, []);

  const shellRef = useRef<HTMLDivElement>(null);

  // Initial window sync
  useEffect(() => {
    syncWindowSize(PILL_BOUNDS_W, PILL_BOUNDS_H);
  }, []);

  // Listen to multi-session media state & position streaming safely
  useEffect(() => {
    let isMounted = true;
    let unlistenState: (() => void) | null = null;
    let unlistenPos: (() => void) | null = null;

    subscribeToMultiSessionState((payload: MultiSessionState) => {
      if (isMounted) setMultiState(payload);
    }).then((fn) => {
      if (isMounted) unlistenState = fn;
      else fn();
    });

    subscribeToSessionPosition((payload: SessionPositionPayload) => {
      if (!isMounted) return;
      setMultiState((prev) => {
        if (!prev) return prev;
        let changed = false;
        const updated = prev.sessions.map((sess) => {
          if (sess.id === payload.id) {
            if (sess.position === payload.position && sess.duration === payload.duration) {
              return sess;
            }
            changed = true;
            return {
              ...sess,
              position: payload.position,
              duration: payload.duration,
            };
          }
          return sess;
        });
        return changed ? { ...prev, sessions: updated } : prev;
      });
    }).then((fn) => {
      if (isMounted) unlistenPos = fn;
      else fn();
    });

    getMultiSessionState().then((res) => {
      if (isMounted && res) setMultiState(res);
    });

    return () => {
      isMounted = false;
      unlistenState?.();
      unlistenPos?.();
    };
  }, []);

  // Filter useful sessions using generic usefulness scoring
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

  const selectedSessionId = multiState?.selectedSessionId || multiState?.activeSessionId;
  const activeMedia: MediaSession | null =
    usefulSessions.find((s) => s.id === selectedSessionId) ||
    usefulSessions[0] ||
    allSessions.find((s) => s.id === selectedSessionId) ||
    allSessions[0] ||
    null;

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-no-drag]")) return;
    
    dragStartRef.current = { x: e.screenX, y: e.screenY };
    
    if (state === "expanded") {
      manualExpandRef.current = true;
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.screenX - dragStartRef.current.x;
    const dy = e.screenY - dragStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      dragStartRef.current = null;
      startWindowDrag();
    }
  };

  const handlePointerUp = () => {
    dragStartRef.current = null;
  };

  return (
    <motion.div
      ref={shellRef}
      className="float-shell"
      animate={{
        width: isExpanded ? SURFACE_WIDTH : PILL_WIDTH,
        height: isExpanded ? SURFACE_HEIGHT : PILL_HEIGHT,
        borderRadius: isExpanded ? 28 : 24,
      }}
      transition={springTransition}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <LayoutGroup>
        <AnimatePresence>
          {isExpanded ? (
            <FloatSurface key="surface" onCollapse={collapse} media={activeMedia} multiState={multiState} />
          ) : (
            <FloatPill key="pill" onClick={expand} media={activeMedia} sessionCount={usefulSessions.length} />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </motion.div>
  );
};

export default FloatShell;
