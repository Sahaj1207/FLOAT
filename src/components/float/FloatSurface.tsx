import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { NotificationItem } from "../../platform";
import { HomeView } from "./HomeView";
import { FloatNotificationsView } from "./FloatNotificationsView";
import { FloatSettingsView } from "./FloatSettingsView";
import { ControlsView } from "./ControlCenter";
import { ShelfView } from "./Shelf";
import "./FloatSurface.css";

interface FloatSurfaceProps {
  onCollapse: () => void;
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
  onSelectSession?: (sessionId: string) => void;
  notifications?: NotificationItem[];
  onDismissNotification?: (id: number) => void;
  onClearAllNotifications?: () => void;
  focusActive?: boolean;
}

export type SurfaceTab = "home" | "shelf" | "notifications" | "controls" | "settings";

const icon = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const TAB_ICONS: Record<SurfaceTab, React.ReactNode> = {
  home: icon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>),
  shelf: icon(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>),
  controls: icon(<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  notifications: icon(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
  settings: icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
};

const TAB_LABELS: Record<SurfaceTab, string> = {
  home: "Home",
  shelf: "Shelf",
  notifications: "Notifications",
  controls: "Controls",
  settings: "Settings",
};

// Content tabs sit on the left of the top bar; system tabs on the right.
const LEFT_TABS: SurfaceTab[] = ["home", "shelf", "notifications"];
const RIGHT_TABS: SurfaceTab[] = ["controls", "settings"];

const tabTransition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };

export const FloatSurface: React.FC<FloatSurfaceProps> = ({
  onCollapse,
  media,
  multiState,
  onSelectSession,
  notifications = [],
  onDismissNotification = () => {},
  onClearAllNotifications = () => {},
  focusActive = false,
}) => {
  const [activeTab, setActiveTab] = useState<SurfaceTab>("home");

  const tabButton = (tab: SurfaceTab) => (
    <button
      key={tab}
      type="button"
      className={`float-surface-nav-btn ${activeTab === tab ? "active" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setActiveTab(tab);
      }}
      data-no-drag="true"
      aria-label={TAB_LABELS[tab]}
      title={TAB_LABELS[tab]}
    >
      {TAB_ICONS[tab]}
      {tab === "notifications" && notifications.length > 0 && (
        <span className="float-nav-badge">{notifications.length}</span>
      )}
    </button>
  );

  const body = (() => {
    switch (activeTab) {
      case "home":
        return <HomeView media={media} multiState={multiState} onSelectSession={onSelectSession} />;
      case "notifications":
        return (
          <FloatNotificationsView
            notifications={notifications}
            onDismiss={onDismissNotification}
            onClearAll={onClearAllNotifications}
          />
        );
      case "shelf":
        return <ShelfView />;
      case "controls":
        return <ControlsView focusActive={focusActive} />;
      case "settings":
        return <FloatSettingsView />;
    }
  })();

  return (
    <motion.div layoutId="island-glass" className="float-surface-content island-glass">
      <div className="float-surface-top-bar">
        <div className="float-surface-nav-left">{LEFT_TABS.map(tabButton)}</div>

        <button
          className="float-surface-header-center"
          onClick={onCollapse}
          data-no-drag="true"
          aria-label="Collapse island"
        >
          <div className="float-surface-handle" />
        </button>

        <div className="float-surface-nav-right">{RIGHT_TABS.map(tabButton)}</div>
      </div>

      <div className="float-surface-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={tabTransition}
            style={{ width: "100%", height: "100%" }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default FloatSurface;
