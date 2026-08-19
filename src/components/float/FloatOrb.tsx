import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MediaSession } from "../../platform/media";
import "./FloatOrb.css";

export interface OrbNotificationState {
  hasNotification?: boolean;
  isNew?: boolean;
  appName?: string;
  title?: string;
  body?: string;
}

export interface OrbFocusState {
  status?: "normal" | "active" | "unknown";
}

interface FloatOrbProps {
  onClick?: () => void;
  media?: MediaSession | null;
  notification?: OrbNotificationState | null;
  focus?: OrbFocusState | null;
  isPreviewOpen?: boolean;
  onClosePreview?: () => void;
  isQuickActionsOpen?: boolean;
  onCloseQuickActions?: () => void;
  onPrev?: () => void;
  onPlayPause?: () => void;
  onNext?: () => void;
  showPresence?: boolean;
  showContent?: boolean;
}

export const FloatOrb: React.FC<FloatOrbProps> = ({
  onClick,
  media,
  notification,
  focus,
  isPreviewOpen = false,
  onClosePreview,
  isQuickActionsOpen = false,
  onCloseQuickActions,
  onPrev,
  onPlayPause,
  onNext,
  showPresence = true,
  showContent = true,
}) => {
  const hasMedia = !!media?.hasMedia;
  const isPlaying = hasMedia && !!media?.isPlaying;
  const hasNotification = !!notification?.hasNotification && showPresence;
  const isNotificationNew = hasNotification && !!notification?.isNew;
  const isFocusActive = focus?.status === "active";

  return (
    <motion.div
      layoutId="island-glass"
      className={`float-orb-container island-glass ${isPreviewOpen ? "preview-open" : ""} ${isQuickActionsOpen ? "quick-actions-open" : ""}`}
      onClick={onClick}
    >
      {isPreviewOpen ? (
        <motion.div
          key="orb-preview-content"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="orb-preview-content"
        >
          <div className="orb-preview-header">
            <div className="orb-preview-app-row">
              <span className="orb-preview-dot" />
              <span className="orb-preview-app-name">
                {showContent ? (notification?.appName || "Notification") : "Notification"}
              </span>
            </div>
            {onClosePreview && (
              <button
                type="button"
                className="orb-preview-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePreview();
                }}
                aria-label="Close notification preview"
                data-no-drag="true"
              >
                ✕
              </button>
            )}
          </div>
          <div className="orb-preview-body-container">
            {showContent ? (
              <>
                {notification?.title && (
                  <div className="orb-preview-title">{notification.title}</div>
                )}
                {notification?.body && (
                  <div className="orb-preview-body">{notification.body}</div>
                )}
              </>
            ) : (
              <>
                <div className="orb-preview-title">New notification</div>
                <div className="orb-preview-body">Content hidden by privacy preference</div>
              </>
            )}
          </div>
        </motion.div>
      ) : isQuickActionsOpen ? (
        <motion.div
          key="orb-quick-actions"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="orb-quick-actions-content"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="orb-qa-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPrev?.();
            }}
            disabled={!hasMedia}
            aria-label="Previous track"
            data-no-drag="true"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="orb-qa-icon">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button
            type="button"
            className="orb-qa-btn orb-qa-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              onPlayPause?.();
            }}
            disabled={!hasMedia}
            aria-label={isPlaying ? "Pause" : "Play"}
            data-no-drag="true"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="orb-qa-icon">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="orb-qa-icon">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="orb-qa-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNext?.();
            }}
            disabled={!hasMedia}
            aria-label="Next track"
            data-no-drag="true"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="orb-qa-icon">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          {onCloseQuickActions && (
            <button
              type="button"
              className="orb-qa-btn orb-qa-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCloseQuickActions();
              }}
              aria-label="Close quick actions"
              data-no-drag="true"
            >
              ✕
            </button>
          )}
        </motion.div>
      ) : (
        <div className="float-orb-content">
          <div className="float-orb-indicator-slot">
            <AnimatePresence mode="wait" initial={false}>
              {isPlaying ? (
                <motion.div
                  key="playing"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="orb-equalizer-bars"
                >
                  <span className="orb-bar orb-bar-1" />
                  <span className="orb-bar orb-bar-2" />
                  <span className="orb-bar orb-bar-3" />
                </motion.div>
              ) : hasMedia ? (
                <motion.div
                  key="paused"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="orb-paused-indicator"
                >
                  <span className="orb-paused-dot" />
                </motion.div>
              ) : (
                <motion.div
                  key="none"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="float-orb-indicator"
                />
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {hasNotification && (
              <div className="orb-notification-slot">
                <motion.div
                  key={isNotificationNew ? "new" : "present"}
                  initial={isNotificationNew ? { opacity: 0, scale: 0.5 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className={`orb-notification-dot ${isNotificationNew ? "is-new" : ""}`}
                  aria-label={isNotificationNew ? "FLOAT has a new notification" : "FLOAT has notifications"}
                />
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isFocusActive && (
              <div className="orb-focus-slot">
                <motion.div
                  key="focus-active"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="orb-focus-dot"
                  aria-label="Windows Focus / quiet mode active"
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

export default FloatOrb;
