import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { FloatPill } from "./FloatPill";
import { FloatSurface } from "./FloatSurface";
import { FloatOrb, OrbNotificationState, OrbFocusState } from "./FloatOrb";
import {
  startWindowDrag,
  subscribeToMultiSessionState,
  subscribeToSessionPosition,
  subscribeToNotificationPresence,
  NotificationPresencePayload,
  NotificationItem,
  removeNotification,
  clearAllNotifications,
  subscribeToFocusPresence,
  getFocusPresence,
  FocusPresencePayload,
  syncWindowSize,
  getMultiSessionState,
  selectMediaSession,
  mediaPlayPause,
  mediaNext,
  mediaPrev,
} from "../../platform";
import { MediaSession, MultiSessionState, SessionPositionPayload } from "../../platform/media";
import { mediaTimeline } from "./mediaTimeline";
import { loadSettings, saveSettings, subscribeToSettings, FloatSettings } from "../../services/settings";
import "./FloatShell.css";

export type IslandVisualMode = "orb" | "compact" | "compactPreview" | "expanded";

const PILL_HEIGHT = 48;
const SURFACE_WIDTH = 460;
const SURFACE_HEIGHT = 330;
const NOTIF_PREVIEW_WIDTH = 240;
const NOTIF_PREVIEW_HEIGHT = 56;
const QUICK_ACTIONS_WIDTH = 176;
const QUICK_ACTIONS_HEIGHT = 48;

const PILL_BOUNDS_W = 280;
const PILL_BOUNDS_H = 88;
const SURFACE_BOUNDS_W = SURFACE_WIDTH + 40;
const SURFACE_BOUNDS_H = SURFACE_HEIGHT + 60;

const DOUBLE_TAP_WINDOW_MS = 250;
const IDLE_TO_ORB_DELAY_MS = 3000;

const springTransition = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};

const getRestingDestination = (cfg: FloatSettings): "orb" | "compact" => {
  if (cfg.idleBehavior === "alwaysOrb") return "orb";
  if (cfg.idleBehavior === "alwaysPill") return "compact";
  return cfg.rememberedRestingMode ?? "compact";
};

const FloatShell: React.FC = () => {
  const [visualMode, setVisualMode] = useState<IslandVisualMode>(() => getRestingDestination(loadSettings()));
  const [multiState, setMultiState] = useState<MultiSessionState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<OrbNotificationState | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationActive, setIsNotificationActive] = useState(false);
  const [notificationPreviewOpen, setNotificationPreviewOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [focusState, setFocusState] = useState<OrbFocusState | null>(null);
  const [settings, setSettings] = useState<FloatSettings>(() => loadSettings());
  const [pillWidth, setPillWidth] = useState<number>(() => loadSettings().pillLength);
  const [orbSize, setOrbSize] = useState<number>(() => loadSettings().orbSize);

  const isExpanded = visualMode === "expanded";
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleToOrbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const isNotificationActiveRef = useRef(isNotificationActive);
  isNotificationActiveRef.current = isNotificationActive;

  const visualModeRef = useRef(visualMode);
  visualModeRef.current = visualMode;

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

  const clearClickTimer = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const clearIdleToOrbTimer = useCallback(() => {
    if (idleToOrbTimerRef.current) {
      clearTimeout(idleToOrbTimerRef.current);
      idleToOrbTimerRef.current = null;
    }
  }, []);

  const transitionTo = useCallback((nextMode: IslandVisualMode, reason: string) => {
    console.log(`[ISLAND] visual: ${visualMode} -> ${nextMode} reason=${reason}`);
    clearHoverTimers();
    clearClickTimer();
    clearIdleToOrbTimer();
    lastClickTimeRef.current = 0;
    setNotificationPreviewOpen(false);
    setQuickActionsOpen(false);

    if (nextMode === "expanded") {
      console.log(`[WINDOW] compact -> expanded reason=${reason}`);
      syncWindowSize(SURFACE_BOUNDS_W, SURFACE_BOUNDS_H);
    } else if (visualMode === "expanded") {
      console.log(`[WINDOW] expanded -> compact reason=${reason}`);
      syncWindowSize(PILL_BOUNDS_W, PILL_BOUNDS_H);
    }

    setVisualMode(nextMode);
  }, [visualMode, clearHoverTimers, clearClickTimer, clearIdleToOrbTimer]);

  const resetIdleToOrbTimer = useCallback(() => {
    clearIdleToOrbTimer();
    if (
      isNotificationActiveRef.current ||
      visualModeRef.current !== "compact" ||
      isDraggingRef.current
    ) {
      return;
    }

    idleToOrbTimerRef.current = setTimeout(() => {
      idleToOrbTimerRef.current = null;
      if (
        !isDraggingRef.current &&
        visualModeRef.current === "compact" &&
        !isNotificationActiveRef.current
      ) {
        console.log("[ISLAND] idle ~3s untouched -> morph to Orb");
        transitionTo("orb", "idle-to-orb");
      }
    }, IDLE_TO_ORB_DELAY_MS);
  }, [clearIdleToOrbTimer, transitionTo]);

  const handleDismissNotification = useCallback(() => {
    if (notificationDwellTimerRef.current) {
      clearTimeout(notificationDwellTimerRef.current);
      notificationDwellTimerRef.current = null;
    }
    setIsNotificationActive(false);
    setNotificationPreviewOpen(false);
  }, []);

  const handleDismissNotificationItem = useCallback((id: number) => {
    removeNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (notifications.length <= 1) {
      setNotificationState((prev) => (prev ? { ...prev, hasNotification: false } : null));
    }
  }, [notifications.length]);

  const handleClearAllNotifications = useCallback(() => {
    clearAllNotifications();
    setNotifications([]);
    setNotificationState({
      hasNotification: false,
      isNew: false,
    });
    setIsNotificationActive(false);
    setNotificationPreviewOpen(false);
  }, []);

  const handlePillClick = useCallback(() => {
    if (isDraggingRef.current) return;
    clearIdleToOrbTimer();
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    if (timeSinceLastClick < DOUBLE_TAP_WINDOW_MS) {
      // Second tap inside window -> double tap to Orb
      clearClickTimer();
      lastClickTimeRef.current = 0;
      const currentSettings = loadSettings();
      if (currentSettings.rememberedRestingMode !== "orb") {
        saveSettings({ ...currentSettings, rememberedRestingMode: "orb" });
      }
      transitionTo("orb", "double-tap");
    } else {
      // First tap -> defer single click to Expanded
      lastClickTimeRef.current = now;
      clearClickTimer();
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        lastClickTimeRef.current = 0;
        if (!isDraggingRef.current) {
          transitionTo("expanded", "user-click");
        }
      }, DOUBLE_TAP_WINDOW_MS);
    }
  }, [clearClickTimer, clearIdleToOrbTimer, transitionTo]);

  const handleOrbClick = useCallback(() => {
    if (isDraggingRef.current) return;
    clearIdleToOrbTimer();
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    if (timeSinceLastClick < DOUBLE_TAP_WINDOW_MS) {
      // Second tap on Orb -> toggle to Compact Pill
      clearClickTimer();
      lastClickTimeRef.current = 0;
      setNotificationPreviewOpen(false);
      setQuickActionsOpen(false);
      const currentSettings = loadSettings();
      if (currentSettings.rememberedRestingMode !== "compact") {
        saveSettings({ ...currentSettings, rememberedRestingMode: "compact" });
      }
      transitionTo("compact", "orb-double-tap");
    } else {
      // First tap on Orb -> record timestamp & evaluate preview / quick actions toggle
      lastClickTimeRef.current = now;
      clearClickTimer();
      if (notificationPreviewOpen) {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          lastClickTimeRef.current = 0;
          if (!isDraggingRef.current) {
            setNotificationPreviewOpen(false);
            if (settings.idleBehavior === "alwaysPill") {
              transitionTo("compact", "preview-close");
            }
          }
        }, DOUBLE_TAP_WINDOW_MS);
      } else if (quickActionsOpen) {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          lastClickTimeRef.current = 0;
          if (!isDraggingRef.current) {
            setQuickActionsOpen(false);
            if (settings.idleBehavior === "alwaysPill") {
              transitionTo("compact", "quick-actions-close");
            }
          }
        }, DOUBLE_TAP_WINDOW_MS);
      } else if (
        notificationState?.hasNotification &&
        settings.notificationPresence &&
        settings.notificationPreview
      ) {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          lastClickTimeRef.current = 0;
          if (!isDraggingRef.current) {
            setNotificationPreviewOpen(true);
          }
        }, DOUBLE_TAP_WINDOW_MS);
      } else {
        // Single tap on Orb without active notification preview -> open Quick Actions
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          lastClickTimeRef.current = 0;
          if (!isDraggingRef.current) {
            setQuickActionsOpen(true);
          }
        }, DOUBLE_TAP_WINDOW_MS);
      }
    }
  }, [
    clearClickTimer,
    notificationPreviewOpen,
    quickActionsOpen,
    notificationState?.hasNotification,
    settings.notificationPresence,
    settings.notificationPreview,
    settings.idleBehavior,
    transitionTo,
  ]);

  const collapse = useCallback(() => {
    if (isDraggingRef.current) return;
    const dest = getRestingDestination(settings);
    transitionTo(dest, "user-collapse");
  }, [settings, transitionTo]);

  // Keyboard Escape listener to dismiss transient Quick Actions or Notification Preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (quickActionsOpen) {
          setQuickActionsOpen(false);
          if (settings.idleBehavior === "alwaysPill") {
            transitionTo("compact", "escape-quick-actions");
          }
        } else if (notificationPreviewOpen) {
          setNotificationPreviewOpen(false);
          if (settings.idleBehavior === "alwaysPill") {
            transitionTo("compact", "escape-notification-preview");
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickActionsOpen, notificationPreviewOpen, settings.idleBehavior, transitionTo]);

  // Ambient idle timer: Compact Pill -> ~3s untouched -> Orb
  useEffect(() => {
    if (visualMode === "compact" && !isNotificationActive) {
      resetIdleToOrbTimer();
    } else {
      clearIdleToOrbTimer();
    }
    return () => {
      clearIdleToOrbTimer();
    };
  }, [visualMode, isNotificationActive, resetIdleToOrbTimer, clearIdleToOrbTimer]);

  // Initial window sync
  useEffect(() => {
    syncWindowSize(PILL_BOUNDS_W, PILL_BOUNDS_H);
    return () => {
      clearHoverTimers();
      clearClickTimer();
      mediaTimeline.stop();
    };
  }, [clearHoverTimers, clearClickTimer]);

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

  // Listen to Windows notification presence events
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    subscribeToNotificationPresence((payload: NotificationPresencePayload) => {
      if (!isMounted) return;

      // 1. Update persistent notification collection
      if (payload.initialItems) {
        setNotifications(payload.initialItems);
      }

      if (payload.item) {
        const incomingItem = payload.item;
        setNotifications((prev) => {
          const exists = prev.some((n) => n.id === incomingItem.id);
          if (exists) {
            return prev.map((n) => (n.id === incomingItem.id ? incomingItem : n));
          }
          return [incomingItem, ...prev];
        });
      }

      if (payload.removedId) {
        const remId = payload.removedId;
        setNotifications((prev) => prev.filter((n) => n.id !== remId));
      }

      // 2. Manage temporary arrival presentation and presence indicator
      if (payload.hasNotification) {
        setNotificationState({
          hasNotification: true,
          isNew: payload.isNew,
          appName: payload.appName,
          title: payload.title,
          body: payload.body,
        });

        // Trigger dynamic notification presentation on new notification arrival
        if (payload.isNew && settings.notificationPresence) {
          if (settings.notificationPreview) {
            setIsNotificationActive(true);

            if (visualModeRef.current === "orb") {
              setNotificationPreviewOpen(true);
            }

            if (notificationDwellTimerRef.current) {
              clearTimeout(notificationDwellTimerRef.current);
            }

            // Dwell for 3.5 seconds then smoothly return to resting/media state
            notificationDwellTimerRef.current = setTimeout(() => {
              if (isMounted) {
                setIsNotificationActive(false);
                setNotificationPreviewOpen(false);
              }
              notificationDwellTimerRef.current = null;
            }, 3500);
          }

          if (notificationTimerRef.current) {
            clearTimeout(notificationTimerRef.current);
          }
          // Allow the one-shot arrival entrance animation (220ms) to complete and settle
          notificationTimerRef.current = setTimeout(() => {
            if (isMounted) {
              setNotificationState((prev) => (prev ? { ...prev, isNew: false } : prev));
            }
            notificationTimerRef.current = null;
          }, 500);
        }
      } else {
        // All active notifications cleared
        if (notificationTimerRef.current) {
          clearTimeout(notificationTimerRef.current);
          notificationTimerRef.current = null;
        }
        if (notificationDwellTimerRef.current) {
          clearTimeout(notificationDwellTimerRef.current);
          notificationDwellTimerRef.current = null;
        }
        setIsNotificationActive(false);
        setNotificationPreviewOpen(false);
        setNotificationState({
          hasNotification: false,
          isNew: false,
        });
      }
    }).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });

    return () => {
      isMounted = false;
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      if (notificationDwellTimerRef.current) {
        clearTimeout(notificationDwellTimerRef.current);
      }
      unlisten?.();
    };
  }, [settings.notificationPresence, settings.notificationPreview]);

  // Listen to Windows Focus / Quiet Hours presence events
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    subscribeToFocusPresence((payload: FocusPresencePayload) => {
      if (isMounted) {
        setFocusState({ status: payload.status });
      }
    }).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });

    getFocusPresence().then((res) => {
      if (isMounted && res) {
        setFocusState({ status: res.status });
      }
    });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  // Listen to user settings changes (e.g. pill length, orb size, notifications, idle behavior)
  useEffect(() => {
    return subscribeToSettings((newSettings) => {
      setSettings(newSettings);
      setPillWidth(newSettings.pillLength);
      setOrbSize(newSettings.orbSize);

      // If currently resting at idle (not expanded, not preview, not dragging), adapt to new idle destination
      setVisualMode((currentMode) => {
        if (currentMode === "orb" || currentMode === "compact") {
          const targetDest = getRestingDestination(newSettings);
          if (targetDest !== currentMode) {
            return targetDest;
          }
        }
        return currentMode;
      });
    });
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

  const handleQuickPrev = useCallback(() => {
    mediaPrev(activeMedia?.id);
    setQuickActionsOpen(false);
    if (settings.idleBehavior === "alwaysPill") {
      transitionTo("compact", "quick-action-prev");
    }
  }, [activeMedia?.id, settings.idleBehavior, transitionTo]);

  const handleQuickPlayPause = useCallback(() => {
    mediaPlayPause(activeMedia?.id);
    setQuickActionsOpen(false);
    if (settings.idleBehavior === "alwaysPill") {
      transitionTo("compact", "quick-action-playpause");
    }
  }, [activeMedia?.id, settings.idleBehavior, transitionTo]);

  const handleQuickNext = useCallback(() => {
    mediaNext(activeMedia?.id);
    setQuickActionsOpen(false);
    if (settings.idleBehavior === "alwaysPill") {
      transitionTo("compact", "quick-action-next");
    }
  }, [activeMedia?.id, settings.idleBehavior, transitionTo]);

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
    clearIdleToOrbTimer();
    if (visualMode === "orb") {
      if (!notificationPreviewOpen) {
        console.log("[ISLAND] orb hover -> compact");
        transitionTo("compact", "orb-hover");
      }
      return;
    }

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
    } else if (visualMode === "compact" && !isNotificationActive) {
      resetIdleToOrbTimer();
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-no-drag]")) return;

    clearHoverTimers();
    clearIdleToOrbTimer();
    isDraggingRef.current = false;
    dragStartRef.current = { x: e.screenX, y: e.screenY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.screenX - dragStartRef.current.x;
    const dy = e.screenY - dragStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 5) {
      clearHoverTimers();
      clearClickTimer();
      clearIdleToOrbTimer();
      lastClickTimeRef.current = 0;
      isDraggingRef.current = true;

      if (visualMode === "compactPreview") {
        setVisualMode("compact");
      }
      startWindowDrag();
    }
  };

  const handlePointerUp = () => {
    dragStartRef.current = null;
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  };

  return (
    <motion.div
      ref={shellRef}
      className="float-shell"
      animate={{
        width: isExpanded
          ? SURFACE_WIDTH
          : visualMode === "orb"
          ? (notificationPreviewOpen ? NOTIF_PREVIEW_WIDTH : quickActionsOpen ? QUICK_ACTIONS_WIDTH : orbSize)
          : pillWidth,
        height: isExpanded
          ? SURFACE_HEIGHT
          : visualMode === "orb"
          ? (notificationPreviewOpen ? NOTIF_PREVIEW_HEIGHT : quickActionsOpen ? QUICK_ACTIONS_HEIGHT : orbSize)
          : PILL_HEIGHT,
        borderRadius: isExpanded
          ? 28
          : (visualMode === "orb" && !notificationPreviewOpen && !quickActionsOpen ? Math.round(orbSize / 2) : 24),
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
            notifications={notifications}
            onDismissNotification={handleDismissNotificationItem}
            onClearAllNotifications={handleClearAllNotifications}
          />
        ) : visualMode === "orb" ? (
          <FloatOrb
            key="orb"
            media={activeMedia}
            onClick={handleOrbClick}
            notification={notificationState}
            focus={focusState}
            isPreviewOpen={notificationPreviewOpen}
            onClosePreview={() => {
              setNotificationPreviewOpen(false);
              if (settings.idleBehavior === "alwaysPill") {
                transitionTo("compact", "preview-close");
              }
            }}
            isQuickActionsOpen={quickActionsOpen}
            onCloseQuickActions={() => {
              setQuickActionsOpen(false);
              if (settings.idleBehavior === "alwaysPill") {
                transitionTo("compact", "quick-actions-close");
              }
            }}
            onPrev={handleQuickPrev}
            onPlayPause={handleQuickPlayPause}
            onNext={handleQuickNext}
            showPresence={settings.notificationPresence}
            showContent={settings.notificationContent}
          />
        ) : (
          <FloatPill
            key="pill"
            onClick={handlePillClick}
            media={activeMedia}
            sessionCount={allSessions.length}
            isPreview={visualMode === "compactPreview"}
            notification={notificationState}
            isNotificationActive={isNotificationActive}
            onDismissNotification={handleDismissNotification}
            showContent={settings.notificationContent}
          />
        )}
      </LayoutGroup>
    </motion.div>
  );
};

export default FloatShell;
