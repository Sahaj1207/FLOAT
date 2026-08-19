import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationItem } from "../../platform";
import "./FloatNotificationsView.css";

interface FloatNotificationsViewProps {
  notifications: NotificationItem[];
  onDismiss: (id: number) => void;
  onClearAll: () => void;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "Just now";
  const now = Date.now();
  const diffMs = now - timestamp;
  if (diffMs < 0 || diffMs < 60_000) return "Just now";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getAppAccent(appName: string): { bg: string; text: string; dot: string } {
  const name = (appName || "").toLowerCase();
  if (name.includes("whatsapp")) {
    return { bg: "rgba(37, 211, 102, 0.16)", text: "#4ade80", dot: "#22c55e" };
  }
  if (name.includes("spotify")) {
    return { bg: "rgba(30, 215, 96, 0.16)", text: "#4ade80", dot: "#1ed760" };
  }
  if (name.includes("mail") || name.includes("outlook")) {
    return { bg: "rgba(0, 120, 212, 0.18)", text: "#60a5fa", dot: "#0078d4" };
  }
  if (name.includes("security") || name.includes("defender")) {
    return { bg: "rgba(245, 158, 11, 0.18)", text: "#fbbf24", dot: "#f59e0b" };
  }
  return { bg: "rgba(59, 130, 246, 0.16)", text: "#60a5fa", dot: "#3b82f6" };
}

const cardSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};

export const FloatNotificationsView: React.FC<FloatNotificationsViewProps> = ({
  notifications,
  onDismiss,
  onClearAll,
}) => {
  return (
    <div className="float-notifs-view">
      <div className="float-notifs-header">
        <div className="float-notifs-title-group">
          <span className="float-notifs-title">Notifications</span>
          {notifications.length > 0 && (
            <span className="float-notifs-badge">{notifications.length}</span>
          )}
        </div>
        {notifications.length > 0 && (
          <button
            type="button"
            className="float-notifs-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClearAll();
            }}
            data-no-drag="true"
            aria-label="Clear all notifications"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="float-notifs-scroll-area" data-no-drag="true">
        {notifications.length === 0 ? (
          <motion.div
            className="float-notifs-empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className="float-notifs-empty-icon-wrap">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <span className="float-notifs-empty-title">All caught up</span>
            <span className="float-notifs-empty-sub">No unread notifications</span>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {notifications.map((item) => {
              const accent = getAppAccent(item.appName);
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.94, height: 0, marginBottom: 0, padding: 0 }}
                  whileHover={{ scale: 1.008 }}
                  whileTap={{ scale: 0.995 }}
                  transition={cardSpring}
                  className="float-notif-card"
                >
                  <div className="float-notif-card-top">
                    <div className="float-notif-app-badge" style={{ background: accent.bg, color: accent.text }}>
                      <span className="float-notif-dot" style={{ background: accent.dot }} />
                      <span className="float-notif-app-name">{item.appName || "App"}</span>
                    </div>
                    <div className="float-notif-meta-right">
                      <span className="float-notif-time">{formatRelativeTime(item.timestamp)}</span>
                      <button
                        type="button"
                        className="float-notif-dismiss-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismiss(item.id);
                        }}
                        data-no-drag="true"
                        aria-label={`Dismiss notification from ${item.appName}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="float-notif-card-content">
                    {item.title && <div className="float-notif-card-title">{item.title}</div>}
                    {item.body && <div className="float-notif-card-body">{item.body}</div>}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default FloatNotificationsView;
