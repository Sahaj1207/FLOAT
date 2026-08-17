import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { FloatPill } from "./FloatPill";
import { FloatSurface } from "./FloatSurface";
import {
  startWindowDrag,
  subscribeToMultiSessionState,
  subscribeToSessionPosition,
  syncWindowSize,
  getMultiSessionState,
  selectMediaSession,
} from "../../platform";
import { MediaSession, MultiSessionState, SessionPositionPayload } from "../../platform/media";
import { mediaTimeline } from "./mediaTimeline";
import "./FloatShell.css";

export type IslandVisualMode = "compact" | "compactPreview" | "expanded";

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
  const [visualMode, setVisualMode] = useState<IslandVisualMode>("compact");
  const [multiState, setMultiState] = useState<MultiSessionState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  const isExpanded = visualMode === "expanded";
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const clearHoverTimers = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const transitionTo = useCallback((nextMode: IslandVisualMode, reason: string) => {
    console.log(`[ISLAND] visual: ${visualMode} -> ${nextMode} reason=${reason}`);
    clearHoverTimers();

    if (nextMode === "expanded") {
      console.log(`[WINDOW] compact -> expanded reason=${reason}`);
      syncWindowSize(SURFACE_BOUNDS_W, SURFACE_BOUNDS_H);
    } else if (visualMode === "expanded") {
      console.log(`[WINDOW] expanded -> compact reason=${reason}`);
      syncWindowSize(PILL_BOUNDS_W, PILL_BOUNDS_H);
    }

    setVisualMode(nextMode);
  }, [visualMode, clearHoverTimers]);

  const expand = useCallback(() => {
    if (isDraggingRef.current) return;
    transitionTo("expanded", "user-click");
  }, [transitionTo]);

  const collapse = useCallback(() => {
    if (isDraggingRef.current) return;
    transitionTo("compact", "user-collapse");
  }, [transitionTo]);

  // Initial window sync
  useEffect(() => {
    syncWindowSize(PILL_BOUNDS_W, PILL_BOUNDS_H);
    return () => {
      clearHoverTimers();
      mediaTimeline.stop();
    };
  }, [clearHoverTimers]);

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

  const allSessions = multiState?.sessions || [];

  // Effective selected session ID:
  // Priority: explicit local selection > multiState.selectedSessionId > multiState.activeSessionId > first session with media > first session
  const effectiveSelectedId = (selectedSessionId && allSessions.some(s => s.id === selectedSessionId))
    ? selectedSessionId
    : (multiState?.selectedSessionId && allSessions.some(s => s.id === multiState.selectedSessionId))
    ? multiState.selectedSessionId
    : (multiState?.activeSessionId && allSessions.some(s => s.id === multiState.activeSessionId))
    ? multiState.activeSessionId
    : (allSessions.find(s => s.hasMedia || (s.title && s.title.trim().length > 0))?.id || allSessions[0]?.id || null);

  // Authoritative single-session snapshot: all displayed media fields MUST derive from this object
  const activeMedia: MediaSession | null = effectiveSelectedId
    ? allSessions.find(s => s.id === effectiveSelectedId) || null
    : null;

  // Immediate synchronous session switch handler
  const handleSelectSession = useCallback((sessionId: string) => {
    console.log(`[SESSION SELECT] requested=${sessionId}`);
    const target = allSessions.find((s) => s.id === sessionId);
    if (target) {
      setSelectedSessionId(sessionId);
      console.log(`[SESSION SELECT] resolved=${sessionId}`);
      console.log(`[MEDIA SNAPSHOT] session=${target.id} title=${target.title || "none"} artist=${target.artist || "none"} position=${target.position ?? 0} duration=${target.duration ?? 0}`);
      console.log(`[MEDIA DISPLAY] session=${target.id}`);
      mediaTimeline.sync(
        target.id,
        target.title,
        target.position ?? 0,
        target.duration ?? 0,
        target.isPlaying
      );
    }
    selectMediaSession(sessionId);
  }, [allSessions]);

  // Sync authoritative state parameter updates to the central timeline manager
  useEffect(() => {
    if (activeMedia) {
      console.log(`[MEDIA DISPLAY] session=${activeMedia.id}`);
      console.log(`[MEDIA SNAPSHOT] session=${activeMedia.id} title=${activeMedia.title || "none"} artist=${activeMedia.artist || "none"} position=${activeMedia.position ?? 0} duration=${activeMedia.duration ?? 0}`);
      mediaTimeline.sync(
        activeMedia.id,
        activeMedia.title,
        activeMedia.position ?? 0,
        activeMedia.duration ?? 0,
        activeMedia.isPlaying
      );
    } else {
      mediaTimeline.sync(undefined, undefined, 0, 0, false);
    }
  }, [activeMedia?.id, activeMedia?.title, activeMedia?.position, activeMedia?.duration, activeMedia?.isPlaying]);

  const handlePointerEnter = (e: React.PointerEvent) => {
    console.log("[ISLAND] pointer-enter");
    if (isDraggingRef.current || visualMode === "expanded") return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-no-drag]")) return;

    clearHoverTimers();
    if (visualMode === "compact") {
      console.log("[ISLAND] preview-dwell-start");
      previewTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current) {
          transitionTo("compactPreview", "hover-dwell");
        }
      }, 200);
    }
  };

  const handlePointerLeave = () => {
    console.log("[ISLAND] pointer-leave");
    clearHoverTimers();
    if (visualMode === "compactPreview") {
      console.log("[ISLAND] visual compactPreview -> compact delay start");
      leaveTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current) {
          transitionTo("compact", "hover-leave");
        }
      }, 160);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    console.log("[ISLAND] pointer-down");
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-no-drag]")) return;
    
    console.log("[ISLAND] preview-dwell-cancel reason=pointer-down");
    clearHoverTimers();
    isDraggingRef.current = false;
    dragStartRef.current = { x: e.screenX, y: e.screenY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.screenX - dragStartRef.current.x;
    const dy = e.screenY - dragStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      console.log("[ISLAND] drag-start");
      dragStartRef.current = null;
      isDraggingRef.current = true;
      clearHoverTimers();
      if (visualMode === "compactPreview") {
        setVisualMode("compact");
      }
      startWindowDrag();
    }
  };

  const handlePointerUp = () => {
    console.log("[ISLAND] pointer-up");
    dragStartRef.current = null;
    setTimeout(() => {
      isDraggingRef.current = false;
      console.log("[ISLAND] drag-end");
    }, 100);
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
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <LayoutGroup>
        {isExpanded ? (
          <FloatSurface
            key="surface"
            onCollapse={collapse}
            media={activeMedia}
            multiState={multiState}
            onSelectSession={handleSelectSession}
          />
        ) : (
          <FloatPill 
            key="pill" 
            onClick={expand} 
            media={activeMedia} 
            sessionCount={allSessions.length} 
            isPreview={visualMode === "compactPreview"}
          />
        )}
      </LayoutGroup>
    </motion.div>
  );
};

export default FloatShell;
