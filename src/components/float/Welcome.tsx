import React, { useEffect, useState } from "react";
import {
  ClipboardList,
  HardDrive,
  LifeBuoy,
  MousePointer2,
  ScanText,
  Search,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { getHotkey, getPasteHotkey, getSearchHotkey, getTextHotkey } from "../../platform";
import { version } from "../../../package.json";
import "./Welcome.css";

// v3: shown again once for search and the new island look.
const WELCOME_KEY = "float_welcome_v3";
// The release whose "What's new" was last seen ("3.0").
const WHATS_NEW_KEY = "float_whats_new";

type Tip = { Icon: React.ElementType; title: string; text: string };

/** What's new, per feature release. Patch releases have no entry, so they don't show it. */
const WHATS_NEW: Record<string, Tip[]> = {
  "3.0": [
    { Icon: Settings, title: "A new Settings window", text: "Everything in one place, from Controls or the tray menu." },
    { Icon: HardDrive, title: "Your data, backed up", text: "Kept on disk with daily backups. Export moves it all to a new PC." },
    { Icon: Zap, title: "Lighter in the background", text: "Fewer wake-ups when you aren't using it. Easier on battery." },
    { Icon: LifeBuoy, title: "Easier to report problems", text: "About > Copy diagnostics makes a report. FLOAT never sends it." },
  ],
};

const release = version.split(".").slice(0, 2).join(".");

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Which introduction to open on, if any: the welcome on a new PC, or what's new after an update. */
export function introToShow(): "welcome" | "whats-new" | null {
  if (read(WELCOME_KEY) !== "seen") return "welcome";
  if (WHATS_NEW[release] && read(WHATS_NEW_KEY) !== release) return "whats-new";
  return null;
}

export function shouldShowWelcome(): boolean {
  return introToShow() !== null;
}

function markSeen() {
  try {
    localStorage.setItem(WELCOME_KEY, "seen");
    // A new install has nothing to catch up on.
    localStorage.setItem(WHATS_NEW_KEY, release);
  } catch {
    // Not persisted; it will simply show again next launch.
  }
}

/** A one-time introduction: the gestures that aren't discoverable, or what changed in this release. */
export const Welcome: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [mode] = useState(introToShow);
  const [hotkey, setHotkey] = useState<string | null>(null);
  const [searchHotkey, setSearchHotkey] = useState<string | null>(null);
  const [pasteHotkey, setPasteHotkey] = useState<string | null>(null);
  const [textHotkey, setTextHotkey] = useState<string | null>(null);
  useEffect(() => {
    getHotkey().then(setHotkey);
    getSearchHotkey().then(setSearchHotkey);
    getPasteHotkey().then(setPasteHotkey);
    getTextHotkey().then(setTextHotkey);
  }, []);

  const whatsNew = mode === "whats-new";
  const tips: Tip[] = whatsNew
    ? WHATS_NEW[release]
    : [
        { Icon: MousePointer2, title: "Hover or tap to open", text: "Esc or a click outside closes it. Drag it down to float it anywhere." },
        {
          Icon: Search,
          title: "Search anything",
          text: `${searchHotkey ? `${searchHotkey}, or just` : "Just"} start typing. Apps, files, settings and quick sums.`,
        },
        {
          Icon: ClipboardList,
          title: "Paste from history",
          text: `${pasteHotkey ?? "The paste shortcut"} shows what you copied lately. Pin what you paste often.`,
        },
        {
          Icon: ScanText,
          title: "Copy Text from anything",
          text: `${textHotkey ?? "The Copy Text shortcut"}, then drag over any text on screen, even in images.`,
        },
      ];

  return (
    <div className="view welcome">
      <div className="view-header">
        {whatsNew && <Sparkles className="welcome-badge" size={15} strokeWidth={2} />}
        <span className="view-title">{whatsNew ? `What's new in FLOAT ${release}` : "Welcome to FLOAT"}</span>
        <span className="view-hint">{whatsNew ? "Thanks for updating" : hotkey ? `${hotkey} opens it from anywhere` : ""}</span>
        <button
          type="button"
          className="chip welcome-done"
          onClick={(e) => {
            e.stopPropagation();
            markSeen();
            onDone();
          }}
          data-no-drag="true"
        >
          {whatsNew ? "Got it" : "Get started"}
        </button>
      </div>
      <div className="welcome-grid">
        {tips.map(({ Icon, title, text }) => (
          <div key={title} className="welcome-tip">
            <Icon size={16} strokeWidth={2} />
            <div>
              <span className="welcome-tip-title">{title}</span>
              <span className="welcome-tip-text">{text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Welcome;
