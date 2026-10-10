import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MediaSession } from "../../platform/media";
import { MediaWidgetPill } from "./MediaWidgetPill";
import { OrbNotificationState } from "./FloatOrb";
import { AppIcon } from "./AppIcon";
import { VolumeHud } from "./VolumeHud";
import { IdleNotch } from "./IdleNotch";
import { StatusActivity, TimerActivity, VolumeActivity } from "../../activities/types";
import { TimerPill } from "./Timer";
import { DropZone } from "./Shelf";
import { StatusHud } from "./StatusHud";
import "./FloatPill.css";

interface FloatPillProps {
  onClick: () => void;
  media: MediaSession | null;
  sessionCount?: number;
  isPreview?: boolean;
  notification?: OrbNotificationState | null;
  isNotificationActive?: boolean;
  onDismissNotification?: () => void;
  showContent?: boolean;
  volume?: VolumeActivity | null;
  status?: StatusActivity | null;
  timer?: TimerActivity | null;
  /** Files are being dragged over the notch (count), or null. */
  dropCount?: number | null;
  onVolumeChange?: (state: { level: number; muted: boolean }) => void;
}

export const FloatPill: React.FC<FloatPillProps> = ({
  onClick,
  media,
  sessionCount = 1,
  isPreview = false,
  notification,
  isNotificationActive = false,
  onDismissNotification,
  showContent = true,
  volume = null,
  status = null,
  timer = null,
  dropCount = null,
  onVolumeChange = () => {},
}) => {
  // What the notch is showing; a change crossfades with a blur, Apple-style.
  const contentKey = dropCount
    ? "drop"
    : volume
    ? "volume"
    : status
    ? `status-${status.kind}`
    : timer
    ? "timer"
    : isNotificationActive && notification?.hasNotification
    ? "notification"
    : media?.hasMedia
    ? "media"
    : isPreview
    ? "idle-preview"
    : "idle";

  return (
    <motion.div 
      layoutId="island-glass"
      className={`float-pill-container island-glass ${isPreview ? 'preview-active' : ''} ${isNotificationActive ? 'notif-active' : ''}`}
      onClick={onClick}
    >
      <div className="float-pill-content">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={contentKey}
            className="float-pill-swap"
            initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
          >
        {dropCount ? (
          <DropZone count={dropCount} />
        ) : volume ? (
          <VolumeHud activity={volume} onChange={onVolumeChange} />
        ) : status ? (
          <StatusHud activity={status} />
        ) : timer ? (
          <TimerPill state={timer.state} />
        ) : isNotificationActive && notification?.hasNotification ? (
          <div className="float-pill-notification-banner">
            <div className="pill-notif-app-indicator">
              {showContent ? (
                <AppIcon appId={notification.appId} appName={notification.appName} size={32} />
              ) : (
                <span className="pill-notif-dot" />
              )}
            </div>
            <div className="pill-notif-text-block">
              {showContent && (notification.title || notification.body) ? (
                <>
                  <span className="pill-notif-heading">
                    {notification.title || notification.appName || "Notification"}
                  </span>
                  <span className="pill-notif-body">
                    {notification.title ? notification.body || notification.appName : notification.body}
                  </span>
                </>
              ) : (
                <>
                  <span className="pill-notif-heading">{notification.appName || "Notification"}</span>
                  <span className="pill-notif-body">New notification</span>
                </>
              )}
            </div>
            {onDismissNotification && (
              <button
                type="button"
                className="pill-notif-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissNotification();
                }}
                aria-label="Dismiss notification"
                data-no-drag="true"
              >
                ✕
              </button>
            )}
          </div>
        ) : media?.hasMedia ? (
          <MediaWidgetPill media={media} sessionCount={sessionCount} isPreview={isPreview} />
        ) : (
          <IdleNotch isPreview={isPreview} hasUnread={!!notification?.hasNotification} />
        )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default FloatPill;
