import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, LayoutGroup, AnimatePresence } from "framer-motion";
import { FloatPill } from "./FloatPill";
import { FloatSurface } from "./FloatSurface";
import { FloatOrb, OrbNotificationState, OrbFocusState } from "./FloatOrb";
import { SplitBubble } from "./SplitBubble";
import { useAlbumArt } from "./useAlbumArt";
import { useArtColor } from "./useArtColor";
import {
  startWindowDrag,
  subscribeToMultiSessionState,
  subscribeToSessionPosition,
  subscribeToNotificationPresence,
  NotificationPresencePayload,
  NotificationItem,
  removeNotification,
  clearAllNotifications,
  getActiveNotifications,
  subscribeToFocusPresence,
  getFocusPresence,
  FocusPresencePayload,
  setHitRegions,
  subscribeToIslandHover,
  subscribeToWindowFocus,
  subscribeToIslandCommand,
  HitRect,
  getMultiSessionState,
  selectMediaSession,
  mediaPlayPause,
  mediaNext,
  mediaPrev,
} from "../../platform";
import { MediaSession, MultiSessionState, SessionPositionPayload } from "../../platform/media";
import { mediaTimeline } from "./mediaTimeline";
import { loadSettings, saveSettings, subscribeToSettings, FloatSettings } from "../../services/settings";
import { useActivities } from "../../activities/useActivities";
import { ActivityPriority } from "../../activities/types";
import "./FloatShell.css";

export type IslandVisualMode = "orb" | "compact" | "compactPreview" | "expanded";

const PILL_HEIGHT = 48;
const SURFACE_WIDTH = 460;
const SURFACE_HEIGHT = 330;
const NOTIF_PREVIEW_WIDTH = 240;
const NOTIF_PREVIEW_HEIGHT = 56;
const QUICK_ACTIONS_WIDTH = 176;
const QUICK_ACTIONS_HEIGHT = 48;

// Must match the native window width (window.rs) and #root's padding-top.
const WINDOW_WIDTH = 500;
const ISLAND_TOP = 8;
const HIT_PADDING = 4;
const BUBBLE_GAP = 8;
// Long enough for the morph spring to settle before hit regions shrink.
const MORPH_SETTLE_MS = 700;
const NOTIFICATION_DWELL_MS = 3500;

const DOUBLE_TAP_WINDOW_MS = 250;
const IDLE_TO_ORB_DELAY_MS = 3000;

// Morph spring per Animation Intensity. Damping ratios ~1.0 / 0.78 / 0.62:
// subtle never overshoots, balanced settles with a slight Dynamic Island
// bounce, expressive is playful.
const MORPH_SPRINGS = {
  subtle: { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.85 },
  balanced: { type: "spring" as const, stiffness: 380, damping: 28, mass: 0.85 },
  expressive: { type: "spring" as const, stiffness: 340, damping: 21, mass: 0.85 },
};
// How far the island squishes while pressed.
const PRESS_SCALE = { subtle: 0.985, balanced: 0.97, expressive: 0.955 };
const PRESS_SPRING = { type: "spring" as const, stiffness: 600, damping: 30 };

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
  const idleToOrbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);
  const [pressed, setPressed] = useState(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const visualModeRef = useRef(visualMode);
  visualModeRef.current = visualMode;

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

  const { primary, secondary, show, dismissKind } = useActivities(activeMedia);

  // Album-art accent tints the equalizer, progress and a soft glow.
  const accent = useArtColor(useAlbumArt(activeMedia));
  const accentGlow = !!accent && !!activeMedia?.isPlaying;
  const isNotificationActive = primary?.kind === "notification";
  const isNotificationActiveRef = useRef(isNotificationActive);
  isNotificationActiveRef.current = isNotificationActive;

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
    console.log(`[ISLAND] visual: ${visualModeRef.current} -> ${nextMode} reason=${reason}`);
    clearHoverTimers();
    clearClickTimer();
    clearIdleToOrbTimer();
    lastClickTimeRef.current = 0;
    setNotificationPreviewOpen(false);
    setQuickActionsOpen(false);
    setVisualMode(nextMode);
  }, [clearHoverTimers, clearClickTimer, clearIdleToOrbTimer]);

  const resetIdleToOrbTimer = useCallback(() => {
    clearIdleToOrbTimer();
    if (
      isNotificationActiveRef.current ||
      visualModeRef.current !== "compact" ||
      isDraggingRef.current ||
      hoveringRef.current
    ) {
      return;
    }

    idleToOrbTimerRef.current = setTimeout(() => {
      idleToOrbTimerRef.current = null;
      if (
        !isDraggingRef.current &&
        !hoveringRef.current &&
        visualModeRef.current === "compact" &&
        !isNotificationActiveRef.current
      ) {
        console.log("[ISLAND] idle ~3s untouched -> morph to Orb");
        transitionTo("orb", "idle-to-orb");
      }
    }, IDLE_TO_ORB_DELAY_MS);
  }, [clearIdleToOrbTimer, transitionTo]);

  const handleDismissNotification = useCallback(() => {
    dismissKind("notification");
    setNotificationPreviewOpen(false);
  }, [dismissKind]);

  const handleDismissNotificationItem = useCallback((id: number) => {
    removeNotification(id);
    setNotifications((prev) => {
      const remaining = prev.filter((n) => n.id !== id);
      if (remaining.length === 0) {
        setNotificationState((state) => (state ? { ...state, hasNotification: false } : null));
      }
      return remaining;
    });
  }, []);

  const handleClearAllNotifications = useCallback(() => {
    clearAllNotifications();
    setNotifications([]);
    setNotificationState({
      hasNotification: false,
      isNew: false,
    });
    dismissKind("notification");
    setNotificationPreviewOpen(false);
  }, [dismissKind]);

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

  // Keyboard Escape: dismiss the topmost transient surface
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (visualModeRef.current === "expanded") {
        collapse();
      } else if (quickActionsOpen) {
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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickActionsOpen, notificationPreviewOpen, settings.idleBehavior, transitionTo, collapse]);

  // Clicking anywhere outside the island (the window losing focus) collapses it
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;
    subscribeToWindowFocus((focused) => {
      if (!focused && visualModeRef.current === "expanded") {
        collapse();
      }
    }).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });
    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [collapse]);

  // Tray icon, global hotkey and second launches
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;
    subscribeToIslandCommand((command) => {
      if (command === "toggle" && visualModeRef.current === "expanded") {
        collapse();
      } else if (visualModeRef.current !== "expanded") {
        transitionTo("expanded", `command-${command}`);
      }
    }).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });
    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [collapse, transitionTo]);

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

  useEffect(() => {
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
      const cfg = settingsRef.current;

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

      // 2. Presence indicator, and a transient activity for new arrivals
      if (payload.hasNotification) {
        setNotificationState({
          hasNotification: true,
          isNew: payload.isNew,
          appId: payload.item?.appId,
          appName: payload.appName,
          title: payload.title,
          body: payload.body,
        });

        if (payload.isNew && cfg.notificationPresence) {
          if (cfg.notificationPreview) {
            const openedPreview = visualModeRef.current === "orb";
            if (openedPreview) {
              setNotificationPreviewOpen(true);
            }
            show(
              {
                kind: "notification",
                id: `notification:${payload.item?.id ?? Date.now()}`,
                priority: ActivityPriority.notification,
                appId: payload.item?.appId,
                appName: payload.appName,
                title: payload.title,
                body: payload.body,
              },
              NOTIFICATION_DWELL_MS,
              () => {
                if (openedPreview) setNotificationPreviewOpen(false);
              }
            );
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
        dismissKind("notification");
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

    // The native seed event fires during startup, usually before this
    // listener exists, so fetch the current list explicitly.
    getActiveNotifications().then((items) => {
      if (!isMounted || items.length === 0) return;
      setNotifications((prev) => (prev.length > 0 ? prev : items));
      setNotificationState((prev) => prev ?? { hasNotification: true, isNew: false });
    });

    return () => {
      isMounted = false;
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      unlisten?.();
    };
  }, [show, dismissKind]);

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

  // Hover comes from the native hit-test monitor: the window is click-through
  // outside the island, so DOM pointerenter/leave are not reliable.
  const handleHoverChange = (inside: boolean) => {
    hoveringRef.current = inside;
    if (!inside) setPressed(false);
    const mode = visualModeRef.current;
    clearHoverTimers();

    if (inside) {
      clearIdleToOrbTimer();
      if (isDraggingRef.current || mode === "expanded") return;
      if (mode === "orb") {
        if (!notificationPreviewOpen) {
          transitionTo("compact", "orb-hover");
        }
      } else if (mode === "compact") {
        previewTimerRef.current = setTimeout(() => {
          if (!isDraggingRef.current) {
            transitionTo("compactPreview", "hover-dwell");
          }
        }, 200);
      }
    } else if (mode === "compactPreview") {
      leaveTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current) {
          transitionTo("compact", "hover-leave");
        }
      }, 160);
    } else if (mode === "compact" && !isNotificationActiveRef.current) {
      resetIdleToOrbTimer();
    }
  };
  const hoverHandlerRef = useRef(handleHoverChange);
  hoverHandlerRef.current = handleHoverChange;

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;
    subscribeToIslandHover((inside) => hoverHandlerRef.current(inside)).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });
    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  // --- Geometry & hit regions -------------------------------------------
  const islandWidth = isExpanded
    ? SURFACE_WIDTH
    : visualMode === "orb"
    ? (notificationPreviewOpen ? NOTIF_PREVIEW_WIDTH : quickActionsOpen ? QUICK_ACTIONS_WIDTH : orbSize)
    : pillWidth;
  const islandHeight = isExpanded
    ? SURFACE_HEIGHT
    : visualMode === "orb"
    ? (notificationPreviewOpen ? NOTIF_PREVIEW_HEIGHT : quickActionsOpen ? QUICK_ACTIONS_HEIGHT : orbSize)
    : PILL_HEIGHT;
  const islandRadius = isExpanded
    ? 28
    : (visualMode === "orb" && !notificationPreviewOpen && !quickActionsOpen ? Math.round(orbSize / 2) : 24);

  const bubbleActivity =
    secondary && (visualMode === "compact" || visualMode === "compactPreview") ? secondary : null;
  const hasBubble = bubbleActivity !== null;

  const prevGeometryRef = useRef({ width: islandWidth, height: islandHeight });
  useEffect(() => {
    const regionsFor = (width: number, height: number): HitRect[] => {
      const left = (WINDOW_WIDTH - width) / 2;
      const regions: HitRect[] = [{
        x: left - HIT_PADDING,
        y: ISLAND_TOP - HIT_PADDING,
        width: width + HIT_PADDING * 2,
        height: height + HIT_PADDING * 2,
      }];
      if (hasBubble) {
        regions.push({
          x: left + width + BUBBLE_GAP - HIT_PADDING,
          y: ISLAND_TOP - HIT_PADDING,
          width: PILL_HEIGHT + HIT_PADDING * 2,
          height: PILL_HEIGHT + HIT_PADDING * 2,
        });
      }
      return regions;
    };

    // While morphing, cover both the old and new shape so the island never
    // turns click-through under the cursor mid-animation.
    const prev = prevGeometryRef.current;
    setHitRegions([
      ...regionsFor(Math.max(prev.width, islandWidth), Math.max(prev.height, islandHeight)),
      ...regionsFor(islandWidth, islandHeight),
    ]);
    prevGeometryRef.current = { width: islandWidth, height: islandHeight };

    const settle = setTimeout(() => setHitRegions(regionsFor(islandWidth, islandHeight)), MORPH_SETTLE_MS);
    return () => clearTimeout(settle);
  }, [islandWidth, islandHeight, hasBubble]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-no-drag]")) return;

    clearHoverTimers();
    clearIdleToOrbTimer();
    isDraggingRef.current = false;
    dragStartRef.current = { x: e.screenX, y: e.screenY };
    setPressed(true);
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
      // The native drag loop swallows pointerup, so release the squish now.
      setPressed(false);

      if (visualModeRef.current === "compactPreview") {
        setVisualMode("compact");
      }
      startWindowDrag();
    }
  };

  const handlePointerUp = () => {
    dragStartRef.current = null;
    setPressed(false);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  };

  const pillNotification: OrbNotificationState | null =
    primary?.kind === "notification"
      ? { hasNotification: true, appId: primary.appId, appName: primary.appName, title: primary.title, body: primary.body }
      : notificationState;

  return (
    <motion.div
      ref={shellRef}
      className={`float-shell ${accentGlow ? "accent-glow" : ""}`}
      style={accent ? ({ "--float-accent": accent } as React.CSSProperties) : undefined}
      animate={{
        width: islandWidth,
        height: islandHeight,
        borderRadius: islandRadius,
        scale: pressed && !isExpanded ? PRESS_SCALE[settings.animationIntensity] : 1,
      }}
      transition={{ ...MORPH_SPRINGS[settings.animationIntensity], scale: PRESS_SPRING }}
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
            notification={pillNotification}
            isNotificationActive={isNotificationActive}
            onDismissNotification={handleDismissNotification}
            showContent={settings.notificationContent}
          />
        )}
      </LayoutGroup>
      <AnimatePresence>
        {bubbleActivity && (
          <SplitBubble
            key={bubbleActivity.kind}
            activity={bubbleActivity}
            size={PILL_HEIGHT}
            gap={BUBBLE_GAP}
            onClick={() => transitionTo("expanded", "bubble-click")}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FloatShell;
