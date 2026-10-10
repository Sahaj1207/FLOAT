import React, { useEffect, useState } from "react";
import { Inbox, MousePointer2, Move, Volume2 } from "lucide-react";
import { getHotkey } from "../../platform";
import "./Welcome.css";

const WELCOME_KEY = "float_welcome_v2";

/** True until the welcome has been dismissed once on this PC. */
export function shouldShowWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) !== "seen";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(WELCOME_KEY, "seen");
  } catch {
    // Not persisted; it will simply show again next launch.
  }
}

/** A one-time introduction to the gestures that aren't discoverable. */
export const Welcome: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [hotkey, setHotkey] = useState<string | null>(null);
  useEffect(() => {
    getHotkey().then(setHotkey);
  }, []);

  const tips = [
    { Icon: MousePointer2, title: "Hover to open", text: "Rest on the notch. Move away, click outside or press Esc to close." },
    { Icon: Move, title: "Drag to float", text: "Pull it off the top edge for a glass pill. Drop it back to dock." },
    { Icon: Volume2, title: "Scroll for volume", text: "Scroll on the notch. Sideways skips tracks." },
    { Icon: Inbox, title: "Drop files", text: "Drop files on the notch to keep them in the Tray." },
  ];

  return (
    <div className="view welcome">
      <div className="view-header">
        <span className="view-title">Welcome to FLOAT 2</span>
        <span className="view-hint">{hotkey ? `${hotkey} opens it from anywhere` : ""}</span>
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
          Get started
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
