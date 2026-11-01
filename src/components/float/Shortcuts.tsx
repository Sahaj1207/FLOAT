import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Bed,
  Folder,
  Globe,
  Lock,
  MicOff,
  MoonStar,
  Plus,
  ScanText,
  Sun,
  Target,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { CustomShortcut, ShortcutCommand, useShortcuts } from "../../activities/shortcutsStore";
import { focus } from "../../activities/focusStore";
import { openSettingsWindow, runSystemCommand, textgrabStart } from "../../platform";
import { AppIcon } from "./AppIcon";
import "./Shortcuts.css";

const COMMAND_ICONS: Record<ShortcutCommand, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  dark: MoonStar,
  light: Sun,
  lock: Lock,
  sleep: Bed,
  mic: MicOff,
  focus25: Target,
  focus50: Target,
  copytext: ScanText,
  recyclebin: Trash2,
};

/** The glyph inside a shortcut's button. */
export const ShortcutGlyph: React.FC<{ shortcut: CustomShortcut; size?: number }> = ({ shortcut, size = 18 }) => {
  if (shortcut.kind === "app") return <AppIcon appId={shortcut.target} appName={shortcut.name} size={size + 6} />;
  const Icon = shortcut.kind === "url" ? Globe : shortcut.kind === "path" ? Folder : COMMAND_ICONS[shortcut.target as ShortcutCommand] ?? Target;
  return <Icon size={size} strokeWidth={2.2} />;
};

/**
 * Run a shortcut. Resolves when it has started; rejects with a readable
 * reason (e.g. a folder that was moved).
 */
export async function runShortcut(s: CustomShortcut, onDone: () => void): Promise<void> {
  switch (s.kind) {
    case "app":
      await invoke("launch_app", { appId: s.target });
      return onDone();
    case "url":
      await openUrl(/^https?:\/\//i.test(s.target) ? s.target : `https://${s.target}`);
      return onDone();
    case "path":
      await invoke("open_path", { path: s.target });
      return onDone();
    case "command":
      switch (s.target as ShortcutCommand) {
        case "focus25":
          focus.start("", 25);
          return onDone();
        case "focus50":
          focus.start("", 50);
          return onDone();
        case "copytext":
          onDone();
          // Let the island close first, so it isn't in the frozen screen.
          setTimeout(() => textgrabStart(), 380);
          return;
        default:
          await runSystemCommand(s.target as Parameters<typeof runSystemCommand>[0]);
          return onDone();
      }
  }
}

/** The row of shortcut buttons at the top of Controls. */
export const ShortcutsRow: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const shortcuts = useShortcuts();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div className="sc-row">
      {shortcuts.map((s) => (
        <motion.button
          key={s.id}
          type="button"
          className={`sc-btn ${failed === s.id ? "failed" : ""}`}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          onClick={(e) => {
            e.stopPropagation();
            setBusy(s.id);
            setFailed(null);
            runShortcut(s, onDone)
              .catch(() => setFailed(s.id))
              .finally(() => setBusy(null));
          }}
          data-no-drag="true"
          title={failed === s.id ? `${s.name} couldn't open` : s.name}
        >
          <span className={`sc-circle ${s.kind === "app" ? "app" : ""} ${busy === s.id ? "busy" : ""}`} style={s.kind === "app" ? undefined : { background: s.color }}>
            <ShortcutGlyph shortcut={s} />
          </span>
          <span className="sc-label">{s.name}</span>
        </motion.button>
      ))}
      <button
        type="button"
        className="sc-btn"
        onClick={(e) => {
          e.stopPropagation();
          openSettingsWindow("shortcuts");
          onDone();
        }}
        data-no-drag="true"
        title="Add or edit shortcuts"
      >
        <span className="sc-circle add">
          <Plus size={18} strokeWidth={2.2} />
        </span>
        <span className="sc-label">{shortcuts.length ? "Edit" : "Add"}</span>
      </button>
    </div>
  );
};
