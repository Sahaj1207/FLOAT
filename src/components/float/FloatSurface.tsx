import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { NotificationItem } from "../../platform";
import { MediaWidgetSurface } from "./MediaWidgetSurface";
import { FloatNotificationsView } from "./FloatNotificationsView";
import { FloatSettingsView } from "./FloatSettingsView";
import "./FloatSurface.css";

interface FloatSurfaceProps {
  onCollapse: () => void;
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
  onSelectSession?: (sessionId: string) => void;
  notifications?: NotificationItem[];
  onDismissNotification?: (id: number) => void;
  onClearAllNotifications?: () => void;
}

export type SurfaceTab = "media" | "notifications" | "settings";

export const FloatSurface: React.FC<FloatSurfaceProps> = ({
  onCollapse,
  media,
  multiState,
  onSelectSession,
  notifications = [],
  onDismissNotification = () => {},
  onClearAllNotifications = () => {},
}) => {
  const [activeTab, setActiveTab] = useState<SurfaceTab>("media");

  return (
    <motion.div
      layoutId="island-glass"
      className="float-surface-content island-glass"
    >
      <div className="float-surface-top-bar">
        {/* Left navigation buttons (Media & Notifications) */}
        <div className="float-surface-nav-left">
          <button
            type="button"
            className={`float-surface-nav-btn ${activeTab === "media" ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab("media");
            }}
            data-no-drag="true"
            aria-label="Media tab"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </button>

          <button
            type="button"
            className={`float-surface-nav-btn notif-nav-btn ${activeTab === "notifications" ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab("notifications");
            }}
            data-no-drag="true"
            aria-label="Notifications tab"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notifications.length > 0 && (
              <span className="float-nav-badge">{notifications.length}</span>
            )}
          </button>
        </div>

        {/* Center collapse handle */}
        <button
          className="float-surface-header-center"
          onClick={onCollapse}
          data-no-drag="true"
          aria-label="Collapse island"
        >
          <div className="float-surface-handle" />
        </button>

        {/* Right settings button */}
        <div className="float-surface-nav-right">
          <button
            type="button"
            className={`float-surface-nav-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab((prev) => (prev === "settings" ? "media" : "settings"));
            }}
            data-no-drag="true"
            aria-label="Settings tab"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="float-surface-body">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === "settings" ? (
            <motion.div
              key="settings-tab"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: "100%", height: "100%" }}
            >
              <FloatSettingsView />
            </motion.div>
          ) : activeTab === "notifications" ? (
            <motion.div
              key="notifications-tab"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: "100%", height: "100%" }}
            >
              <FloatNotificationsView
                notifications={notifications}
                onDismiss={onDismissNotification}
                onClearAll={onClearAllNotifications}
              />
            </motion.div>
          ) : (
            <motion.div
              key="media-tab"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: "100%", height: "100%" }}
            >
              {media?.hasMedia ? (
                <MediaWidgetSurface media={media} multiState={multiState} onSelectSession={onSelectSession} />
              ) : (
                <div style={{ padding: '40px 20px', color: 'var(--float-text-secondary)', textAlign: 'center' }}>
                  No media playing
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default FloatSurface;
