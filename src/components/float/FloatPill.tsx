import React from "react";
import { motion } from "framer-motion";
import { MediaSession } from "../../platform/media";
import { MediaWidgetPill } from "./MediaWidgetPill";
import { OrbNotificationState } from "./FloatOrb";
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
}) => {
  return (
    <motion.div 
      layoutId="island-glass"
      className={`float-pill-container island-glass ${isPreview ? 'preview-active' : ''} ${isNotificationActive ? 'notif-active' : ''}`}
      onClick={onClick}
    >
      <div className="float-pill-content">
        {isNotificationActive && notification?.hasNotification ? (
          <div className="float-pill-notification-banner">
            <div className="pill-notif-app-indicator">
              <span className="pill-notif-dot" />
            </div>
            <div className="pill-notif-text-block">
              <span className="pill-notif-app-name">
                {notification.appName || "Notification"}
              </span>
              {showContent && (notification.title || notification.body) ? (
                <>
                  <span className="pill-notif-divider">•</span>
                  <span className="pill-notif-body">
                    {notification.title
                      ? `${notification.title}${notification.body ? ': ' + notification.body : ''}`
                      : notification.body}
                  </span>
                </>
              ) : (
                <>
                  <span className="pill-notif-divider">•</span>
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
          <>
            <div className="float-pill-indicator" />
            <span className="float-pill-label">FLOAT</span>
            {notification?.hasNotification && (
              <span className="float-pill-unread-dot" aria-label="Unread notification" />
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

export default FloatPill;
