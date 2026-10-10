import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CircleCheck, House, Inbox, SlidersHorizontal, Timer } from "lucide-react";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { NotificationItem } from "../../platform";
import { HomeView } from "./HomeView";
import { TrayView } from "./TrayView";
import { TasksView } from "./TasksView";
import { TimerView } from "./TimerView";
import { FloatNotificationsView } from "./FloatNotificationsView";
import { FloatSettingsView } from "./FloatSettingsView";
import { ControlsView } from "./ControlCenter";
import "./ui.css";
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

/** "settings" has no icon of its own; it opens from Controls. */
export type SurfaceTab = "home" | "tray" | "tasks" | "timer" | "notifications" | "controls" | "settings";

type BarTab = Exclude<SurfaceTab, "settings">;

const TABS: Record<BarTab, { label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  home: { label: "Home", Icon: House },
  tray: { label: "Tray", Icon: Inbox },
  tasks: { label: "Tasks", Icon: CircleCheck },
  timer: { label: "Timer", Icon: Timer },
  notifications: { label: "Notifications", Icon: Bell },
  controls: { label: "Controls", Icon: SlidersHorizontal },
};

// Things you do on the left; system things on the right.
const LEFT_TABS: BarTab[] = ["home", "tray", "tasks", "timer"];
const RIGHT_TABS: BarTab[] = ["notifications", "controls"];

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

  const tabButton = (tab: BarTab) => {
    const { label, Icon } = TABS[tab];
    // Settings lives under Controls, so keep that icon lit there too.
    const active = activeTab === tab || (tab === "controls" && activeTab === "settings");
    return (
      <button
        key={tab}
        type="button"
        className={`float-surface-nav-btn ${active ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setActiveTab(tab);
        }}
        data-no-drag="true"
        aria-label={label}
        title={label}
      >
        <Icon size={16} strokeWidth={2} />
        {tab === "notifications" && notifications.length > 0 && <span className="float-nav-badge" />}
      </button>
    );
  };

  const body = (() => {
    switch (activeTab) {
      case "home":
        return (
          <HomeView
            media={media}
            multiState={multiState}
            onSelectSession={onSelectSession}
            onOpenTasks={() => setActiveTab("tasks")}
          />
        );
      case "tray":
        return <TrayView />;
      case "tasks":
        return <TasksView />;
      case "timer":
        return <TimerView />;
      case "notifications":
        return (
          <FloatNotificationsView
            notifications={notifications}
            onDismiss={onDismissNotification}
            onClearAll={onClearAllNotifications}
          />
        );
      case "controls":
        return <ControlsView focusActive={focusActive} onOpenSettings={() => setActiveTab("settings")} />;
      case "settings":
        return <FloatSettingsView onClose={() => setActiveTab("controls")} />;
    }
  })();

  return (
    <motion.div layoutId="island-glass" className="float-surface-content island-glass">
      <motion.div
        className="float-surface-top-bar"
        initial={{ opacity: 0, filter: "blur(10px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.3, delay: 0.05, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="float-surface-nav">{LEFT_TABS.map(tabButton)}</div>

        <button
          className="float-surface-header-center"
          onClick={onCollapse}
          data-no-drag="true"
          aria-label="Collapse island"
        >
          <div className="float-surface-handle" />
        </button>

        <div className="float-surface-nav">{RIGHT_TABS.map(tabButton)}</div>
      </motion.div>

      <motion.div
        className="float-surface-body"
        initial={{ opacity: 0, scale: 0.94, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.36, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ transformOrigin: "50% 0%" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
            transition={tabTransition}
            style={{ width: "100%", height: "100%" }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default FloatSurface;
