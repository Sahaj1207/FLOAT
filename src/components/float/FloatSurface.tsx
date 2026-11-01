import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CircleCheck, House, Inbox, Search, SlidersHorizontal, Timer } from "lucide-react";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { getPasteHotkey, getSearchHotkey, NotificationItem, openSettingsWindow } from "../../platform";
import { HomeView } from "./HomeView";
import { TrayView } from "./TrayView";
import { TasksView } from "./TasksView";
import { TimerView } from "./TimerView";
import { FloatNotificationsView } from "./FloatNotificationsView";
import { ControlsView } from "./ControlCenter";
import { SearchView } from "./SearchView";
import { PasteView } from "./PasteView";
import { shouldShowWelcome, Welcome } from "./Welcome";
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
  /** Switch to a tab from outside (the search hotkey); a new nonce re-applies it. */
  request?: SurfaceRequest | null;
  onTabChange?: (tab: SurfaceTab) => void;
}

export interface SurfaceRequest {
  tab: SurfaceTab;
  nonce: number;
  query?: string;
}

export type SurfaceTab = "paste" | "search" | "home" | "tray" | "tasks" | "timer" | "notifications" | "controls";

type BarTab = Exclude<SurfaceTab, "paste">;

const TABS: Record<BarTab, { label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  search: { label: "Search", Icon: Search },
  home: { label: "Home", Icon: House },
  tray: { label: "Tray", Icon: Inbox },
  tasks: { label: "Tasks & Notes", Icon: CircleCheck },
  timer: { label: "Focus & Timer", Icon: Timer },
  notifications: { label: "Notifications", Icon: Bell },
  controls: { label: "Controls", Icon: SlidersHorizontal },
};

// Things you do on the left; system things on the right.
const LEFT_TABS: BarTab[] = ["home", "tray", "tasks", "timer"];
const RIGHT_TABS: BarTab[] = ["search", "notifications", "controls"];

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
  request = null,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<SurfaceTab>(request?.tab ?? "home");
  const [searchSeed, setSearchSeed] = useState(request?.query ?? "");
  const [welcome, setWelcome] = useState(() => shouldShowWelcome() && request?.tab !== "search" && request?.tab !== "paste");
  const [searchHotkey, setSearchHotkey] = useState<string | null>(null);
  // Search opening a task or note in its tab.
  const [tasksOpen, setTasksOpen] = useState<{ mode: "tasks" | "notes"; noteId?: string } | null>(null);

  const [pasteHotkey, setPasteHotkey] = useState<string | null>(null);
  useEffect(() => {
    getSearchHotkey().then(setSearchHotkey);
    getPasteHotkey().then(setPasteHotkey);
  }, []);

  useEffect(() => {
    if (!request) return;
    setWelcome(false);
    setSearchSeed(request.query ?? "");
    setActiveTab(request.tab);
  }, [request?.nonce]);

  useEffect(() => {
    onTabChange?.(welcome ? "home" : activeTab);
  }, [activeTab, welcome]);

  // Type-to-search: typing on any tab without a text field jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeTab === "search" || activeTab === "paste" || welcome || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.length !== 1 || e.key === " ") return;
      e.preventDefault();
      setSearchSeed(e.key);
      setActiveTab("search");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, welcome]);

  const tabButton = (tab: BarTab) => {
    const { label, Icon } = TABS[tab];
    // Settings lives under Controls, so keep that icon lit there too.
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        className={`float-surface-nav-btn ${active ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setTasksOpen(null);
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
    if (welcome) return <Welcome onDone={() => setWelcome(false)} />;
    switch (activeTab) {
      case "paste":
        return <PasteView onDone={onCollapse} onExit={onCollapse} hotkey={pasteHotkey} />;
      case "search":
        return (
          <SearchView
            initialQuery={searchSeed}
            onDone={onCollapse}
            onExit={() => setActiveTab("home")}
            onNavigate={(mode, noteId) => {
              setTasksOpen({ mode, noteId });
              setActiveTab("tasks");
            }}
            hotkey={searchHotkey}
          />
        );
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
        return <TasksView mode={tasksOpen?.mode} noteId={tasksOpen?.noteId ?? null} />;
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
        return (
          <ControlsView
            focusActive={focusActive}
            onCollapse={onCollapse}
            onOpenSettings={() => {
              // Settings is its own window; the island steps aside.
              openSettingsWindow();
              onCollapse();
            }}
          />
        );
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
            key={welcome ? "welcome" : activeTab}
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
