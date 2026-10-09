import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  changeVolume,
  subscribeToVolumeChanged,
  subscribeToPower,
  subscribeToPrivacy,
  getPrivacyState,
  subscribeToBluetoothDevice,
  subscribeToFileDrag,
  PrivacyState,
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
import { Activity, ActivityPriority, isStatusActivity } from "../../activities/types";
import { timer, useTimerState } from "../../activities/timerStore";
import { playChime } from "./Timer";
import { shelf } from "./Shelf";
import "./FloatShell.css";

export type IslandVisualMode = "orb" | "compact" | "compactPreview" | "expanded";

// Notch geometry per state (logical px). The island hangs flush from the
// top edge, so only its bottom corners are rounded.
const NOTCH_IDLE_WIDTH = 200;
const NOTCH_IDLE_HEIGHT = 32;
const ACTIVITY_HEIGHT = 36;
const PREVIEW_HEIGHT = 50;
const PREVIEW_EXTRA_WIDTH = 30;
const NOTIFICATION_HEIGHT = 62;
const NOTIFICATION_MIN_WIDTH = 340;
const DROP_WIDTH = 360;
const DROP_HEIGHT = 86;
const BUBBLE_SIZE = 38;
// The optional orb floats just below the edge instead.
const ORB_TOP = 8;
const SURFACE_WIDTH = 580;
const SURFACE_HEIGHT = 232;
const NOTIF_PREVIEW_WIDTH = 240;
const NOTIF_PREVIEW_HEIGHT = 56;
const QUICK_ACTIONS_WIDTH = 176;
const QUICK_ACTIONS_HEIGHT = 48;

// Must match the native window width (window.rs) and #root's padding-top.
const WINDOW_WIDTH = 640;
const HIT_PADDING = 4;
const BUBBLE_GAP = 8;
// Long enough for the morph spring to settle before hit regions shrink.
const MORPH_SETTLE_MS = 700;
const NOTIFICATION_DWELL_MS = 3500;
const VOLUME_HUD_MS = 1600;
const STATUS_HUD_MS = 2600;
const TIMER_DONE_MS = 10_000;
const VOLUME_STEP = 0.02;
const WHEEL_NOTCH = 100;
const SKIP_COOLDOWN_MS = 600;
const SWIPE_DISMISS_PX = 12;

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

  // A running or paused timer / stopwatch is an ongoing activity.
  const timerState = useTimerState();
  const ongoing = useMemo<Activity[]>(
    () => (timerState.active ? [{ kind: "timer", id: "timer", priority: ActivityPriority.timer, state: timerState }] : []),
    [timerState]
  );
  const { primary, secondary, show, dismissKind } = useActivities(activeMedia, ongoing);

  useEffect(
    () =>
      timer.onFinish((durationMs) => {
        playChime();
        show({ kind: "timerDone", id: "timerDone", priority: ActivityPriority.timerDone, durationMs }, TIMER_DONE_MS);
      }),
    [show]
  );

  // Album-art accent tints the equalizer, progress and a soft glow.
  const accent = useArtColor(useAlbumArt(activeMedia));
  const accentGlow = !!accent && !!activeMedia?.isPlaying;
  const isNotificationActive = primary?.kind === "notification";
  // Any transient (notification, volume HUD...) holds the island awake.
  const hasTransient = primary !== null && primary.kind !== "media";
  const hasTransientRef = useRef(hasTransient);
  hasTransientRef.current = hasTransient;
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

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
      // Island mode (and "remember" after choosing the pill) never shrinks to the orb.
      getRestingDestination(settingsRef.current) !== "orb" ||
      hasTransientRef.current ||
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
        !hasTransientRef.current
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
    if (visualMode === "compact" && !hasTransient) {
      resetIdleToOrbTimer();
    } else {
      clearIdleToOrbTimer();
    }
    return () => {
      clearIdleToOrbTimer();
    };
  }, [visualMode, hasTransient, resetIdleToOrbTimer, clearIdleToOrbTimer]);

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
    } else if (mode === "compact" && !hasTransientRef.current) {
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

  // --- File drops onto the notch (Shelf) --------------------------------
  // Number of files being dragged over the window, or null.
  const [fileDrag, setFileDrag] = useState<number | null>(null);
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;
    subscribeToFileDrag((event) => {
      if (event.type === "enter") {
        setFileDrag(event.paths?.length || 1);
      } else if (event.type === "leave") {
        setFileDrag(null);
      } else if (event.type === "drop") {
        setFileDrag(null);
        if (event.paths.length > 0) {
          shelf.add(event.paths);
          show({ kind: "shelf", id: "shelf", priority: ActivityPriority.shelf, count: event.paths.length }, STATUS_HUD_MS);
        }
      }
    }).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });
    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [show]);
  const showDrop = fileDrag !== null && !isExpanded;

  // --- Geometry & hit regions -------------------------------------------
  const isOrb = visualMode === "orb" && !showDrop;
  const orbOpen = isOrb && (notificationPreviewOpen || quickActionsOpen);
  const isPreview = visualMode === "compactPreview";

  let islandWidth: number;
  let islandHeight: number;
  let bottomRadius: number;
  if (isExpanded) {
    [islandWidth, islandHeight, bottomRadius] = [SURFACE_WIDTH, SURFACE_HEIGHT, 28];
  } else if (showDrop) {
    [islandWidth, islandHeight, bottomRadius] = [DROP_WIDTH, DROP_HEIGHT, 26];
  } else if (isOrb) {
    islandWidth = notificationPreviewOpen ? NOTIF_PREVIEW_WIDTH : quickActionsOpen ? QUICK_ACTIONS_WIDTH : orbSize;
    islandHeight = notificationPreviewOpen ? NOTIF_PREVIEW_HEIGHT : quickActionsOpen ? QUICK_ACTIONS_HEIGHT : orbSize;
    bottomRadius = orbOpen ? 24 : Math.round(orbSize / 2);
  } else if (primary?.kind === "notification") {
    [islandWidth, islandHeight, bottomRadius] = [Math.max(pillWidth, NOTIFICATION_MIN_WIDTH), NOTIFICATION_HEIGHT, 24];
  } else if (primary) {
    islandWidth = pillWidth + (isPreview ? PREVIEW_EXTRA_WIDTH : 0);
    islandHeight = isPreview ? PREVIEW_HEIGHT : ACTIVITY_HEIGHT;
    bottomRadius = isPreview ? 22 : 18;
  } else {
    // Nothing live: a quiet notch; hovering reveals the time.
    islandWidth = isPreview ? pillWidth : NOTCH_IDLE_WIDTH;
    islandHeight = isPreview ? ACTIVITY_HEIGHT : NOTCH_IDLE_HEIGHT;
    bottomRadius = isPreview ? 18 : 12;
  }
  const topRadius = isOrb ? bottomRadius : 0;
  const islandTop = isOrb ? ORB_TOP : 0;

  const bubbleActivity =
    secondary && (visualMode === "compact" || visualMode === "compactPreview") ? secondary : null;
  const hasBubble = bubbleActivity !== null;

  const prevGeometryRef = useRef({ width: islandWidth, height: islandHeight });
  useEffect(() => {
    const regionsFor = (width: number, height: number): HitRect[] => {
      const left = (WINDOW_WIDTH - width) / 2;
      const regions: HitRect[] = [{
        x: left - HIT_PADDING,
        y: islandTop - HIT_PADDING,
        width: width + HIT_PADDING * 2,
        height: height + HIT_PADDING * 2,
      }];
      if (hasBubble) {
        regions.push({
          x: left + width + BUBBLE_GAP - HIT_PADDING,
          y: islandTop - HIT_PADDING,
          width: BUBBLE_SIZE + HIT_PADDING * 2,
          height: BUBBLE_SIZE + HIT_PADDING * 2,
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
  }, [islandWidth, islandHeight, islandTop, hasBubble]);

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

    // Swipe up on a notification banner dismisses it instead of dragging.
    if (primaryRef.current?.kind === "notification" && dy < -SWIPE_DISMISS_PX && Math.abs(dy) > Math.abs(dx)) {
      dragStartRef.current = null;
      setPressed(false);
      clearClickTimer();
      lastClickTimeRef.current = 0;
      handleDismissNotification();
      return;
    }
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

  // --- Wheel gestures ------------------------------------------------------
  // Vertical: system volume. Horizontal (or Shift+wheel): previous/next track.
  const wheelRef = useRef({
    volumeDelta: 0,
    flushTimer: null as ReturnType<typeof setTimeout> | null,
    skip: 0,
    lastSkip: 0,
  });

  const showVolume = useCallback((state: { level: number; muted: boolean }) => {
    show(
      { kind: "volume", id: "volume", priority: ActivityPriority.volume, level: state.level, muted: state.muted },
      VOLUME_HUD_MS
    );
  }, [show]);

  const handleWheel = (e: React.WheelEvent) => {
    if (visualModeRef.current === "expanded") return;
    const wheel = wheelRef.current;
    const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (horizontal) {
      if (!activeMedia?.hasMedia) return;
      wheel.skip += e.shiftKey ? e.deltaY : e.deltaX;
      const now = Date.now();
      if (Math.abs(wheel.skip) >= WHEEL_NOTCH && now - wheel.lastSkip > SKIP_COOLDOWN_MS) {
        (wheel.skip > 0 ? mediaNext : mediaPrev)(activeMedia.id);
        wheel.skip = 0;
        wheel.lastSkip = now;
      }
      return;
    }

    // One mouse-wheel notch (deltaY 100) = 2%. Touchpads send many small
    // deltas, so batch them into one native call per flush.
    wheel.volumeDelta += (-e.deltaY / WHEEL_NOTCH) * VOLUME_STEP;
    if (!wheel.flushTimer) {
      wheel.flushTimer = setTimeout(() => {
        const delta = Math.max(-0.2, Math.min(0.2, wheel.volumeDelta));
        wheel.volumeDelta = 0;
        wheel.flushTimer = null;
        changeVolume(delta).then((state) => state && showVolume(state));
      }, 40);
    }
  };

  // --- System status activities ------------------------------------------
  const [privacy, setPrivacy] = useState<PrivacyState>({ microphone: null, camera: null });
  const privacyRef = useRef(privacy);

  useEffect(() => {
    let isMounted = true;
    const unlisteners: Promise<() => void>[] = [];

    // Hardware volume keys and other apps changing the volume.
    unlisteners.push(subscribeToVolumeChanged((state) => showVolume(state)));

    unlisteners.push(subscribeToBluetoothDevice(({ name, connected }) => {
      show(
        { kind: "bluetooth", id: "bluetooth", priority: ActivityPriority.bluetooth, device: name, connected },
        STATUS_HUD_MS
      );
    }));

    unlisteners.push(subscribeToPower(({ percent, charging, low }) => {
      show(
        { kind: "battery", id: "battery", priority: ActivityPriority.battery, percent, charging, low },
        STATUS_HUD_MS
      );
    }));

    getPrivacyState().then((state) => {
      if (!isMounted) return;
      privacyRef.current = state;
      setPrivacy(state);
    });
    unlisteners.push(subscribeToPrivacy((next) => {
      const prev = privacyRef.current;
      privacyRef.current = next;
      setPrivacy(next);
      // Announce whichever device just started (or stopped) being used.
      const changed = (["camera", "microphone"] as const).find((d) => prev[d] !== next[d]);
      if (changed) {
        show(
          { kind: "privacy", id: "privacy", priority: ActivityPriority.privacy, device: changed, app: next[changed] },
          STATUS_HUD_MS
        );
      }
    }));

    return () => {
      isMounted = false;
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, [show, showVolume]);

  // Announce Focus Assist turning on or off (not its initial state).
  const prevFocusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const status = focusState?.status;
    const prev = prevFocusRef.current;
    prevFocusRef.current = status;
    if (!prev || !status || status === "unknown" || prev === "unknown" || prev === status) return;
    show({ kind: "focus", id: "focus", priority: ActivityPriority.focus, active: status === "active" }, STATUS_HUD_MS);
  }, [focusState?.status, show]);

  const pillNotification: OrbNotificationState | null =
    primary?.kind === "notification"
      ? { hasNotification: true, appId: primary.appId, appName: primary.appName, title: primary.title, body: primary.body }
      : notificationState;

  return (
    <motion.div
      ref={shellRef}
      className={`float-shell ${accentGlow ? "accent-glow" : ""} ${isOrb ? "" : "attached"} ${isExpanded ? "expanded" : ""}`}
      style={accent ? ({ "--float-accent": accent } as React.CSSProperties) : undefined}
      animate={{
        width: islandWidth,
        height: islandHeight,
        y: islandTop,
        borderTopLeftRadius: topRadius,
        borderTopRightRadius: topRadius,
        borderBottomLeftRadius: bottomRadius,
        borderBottomRightRadius: bottomRadius,
        scale: pressed && !isExpanded ? PRESS_SCALE[settings.animationIntensity] : 1,
      }}
      transition={{ ...MORPH_SPRINGS[settings.animationIntensity], scale: PRESS_SPRING }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <span className="notch-ear left" />
      <span className="notch-ear right" />
      {(privacy.camera || privacy.microphone) && (
        <span className="privacy-dots" aria-label="Camera or microphone in use">
          {privacy.camera && <span className="privacy-dot camera" title={`Camera: ${privacy.camera}`} />}
          {privacy.microphone && <span className="privacy-dot microphone" title={`Microphone: ${privacy.microphone}`} />}
        </span>
      )}
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
            focusActive={focusState?.status === "active"}
          />
        ) : isOrb ? (
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
            volume={primary?.kind === "volume" ? primary : null}
            status={isStatusActivity(primary) ? primary : null}
            timer={primary?.kind === "timer" ? primary : null}
            dropCount={showDrop ? fileDrag : null}
            onVolumeChange={showVolume}
          />
        )}
      </LayoutGroup>
      <AnimatePresence>
        {bubbleActivity && (
          <SplitBubble
            key={bubbleActivity.kind}
            activity={bubbleActivity}
            size={BUBBLE_SIZE}
            gap={BUBBLE_GAP}
            onClick={() => transitionTo("expanded", "bubble-click")}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FloatShell;
