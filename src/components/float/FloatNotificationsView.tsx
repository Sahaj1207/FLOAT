import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { NotificationItem } from "../../platform";
import { AppIcon } from "./AppIcon";
import "./FloatNotificationsView.css";

interface FloatNotificationsViewProps {
  notifications: NotificationItem[];
  onDismiss: (id: number) => void;
  onClearAll: () => void;
}

function relativeTime(timestamp: number): string {
  const mins = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Notification history: one quiet row per notification. */
export const FloatNotificationsView: React.FC<FloatNotificationsViewProps> = ({
  notifications,
  onDismiss,
  onClearAll,
}) => (
  <div className="view notifs-view">
    <div className="view-header">
      <span className="view-title">Notifications</span>
      <span className="view-hint">{notifications.length > 0 ? notifications.length : ""}</span>
      {notifications.length > 0 && (
        <button
          type="button"
          className="view-action"
          onClick={(e) => {
            e.stopPropagation();
            onClearAll();
          }}
          data-no-drag="true"
        >
          Clear all
        </button>
      )}
    </div>

    {notifications.length === 0 ? (
      <div className="view-empty">No notifications</div>
    ) : (
      <div className="notif-list" data-no-drag="true">
        <AnimatePresence initial={false}>
          {notifications.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ type: "spring", stiffness: 460, damping: 36 }}
              className="notif-row"
            >
              <AppIcon appId={item.appId} appName={item.appName} size={28} />
              <div className="notif-text">
                <div className="notif-top">
                  <span className="notif-title">{item.title || item.appName || "Notification"}</span>
                  <span className="notif-meta">
                    {item.title ? `${item.appName} · ` : ""}
                    {relativeTime(item.timestamp)}
                  </span>
                </div>
                {item.body && <span className="notif-body">{item.body}</span>}
              </div>
              <button
                type="button"
                className="notif-dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(item.id);
                }}
                aria-label={`Dismiss notification from ${item.appName}`}
                data-no-drag="true"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    )}
  </div>
);

export default FloatNotificationsView;
