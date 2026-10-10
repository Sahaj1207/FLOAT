import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardEntry,
  clearClipboardHistory,
  copyClipboardEntry,
  getClipboardHistory,
  removeClipboardEntry,
  subscribeToClipboard,
} from "../../platform";
import { loadSettings, subscribeToSettings } from "../../services/settings";
import "./ClipboardView.css";

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Recent copies; click one to copy it again. */
export const ClipboardView: React.FC<{ header?: React.ReactNode }> = ({ header }) => {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(() => loadSettings().clipboardHistory);

  useEffect(() => {
    let isMounted = true;
    getClipboardHistory().then((list) => isMounted && setEntries(list));
    const unlisten = subscribeToClipboard((list) => isMounted && setEntries(list));
    const unsubscribeSettings = subscribeToSettings((s) => {
      setEnabled(s.clipboardHistory);
      if (!s.clipboardHistory) setEntries([]);
    });
    return () => {
      isMounted = false;
      unlisten.then((fn) => fn());
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    if (copiedId === null) return;
    const t = setTimeout(() => setCopiedId(null), 1200);
    return () => clearTimeout(t);
  }, [copiedId]);

  return (
    <div className="view clip-view">
      <div className="view-header">
        {header ?? <span className="view-title">Clipboard</span>}
        <span className="view-hint" />
        {entries.length > 0 && (
          <button
            type="button"
            className="view-action"
            onClick={(e) => {
              e.stopPropagation();
              clearClipboardHistory();
              setEntries([]);
            }}
            data-no-drag="true"
          >
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="clip-empty">{enabled ? "Things you copy appear here" : "Clipboard history is off in Settings"}</div>
      ) : (
        <div className="clip-list">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
                className={`clip-item ${copiedId === entry.id ? "copied" : ""}`}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  copyClipboardEntry(entry.id).then((ok) => ok && setCopiedId(entry.id));
                }}
                data-no-drag="true"
              >
                {entry.kind === "image" && entry.thumb ? (
                  <img className="clip-image" src={`data:image/png;base64,${entry.thumb}`} alt="" draggable={false} />
                ) : (
                  <span className="clip-text">{entry.text}</span>
                )}
                <span className="clip-meta">
                  {copiedId === entry.id
                    ? "Copied"
                    : entry.kind === "image" && entry.width
                    ? `${entry.width}×${entry.height} · ${timeAgo(entry.at)}`
                    : timeAgo(entry.at)}
                </span>
                <button
                  type="button"
                  className="clip-remove"
                  aria-label="Remove from history"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeClipboardEntry(entry.id).then(setEntries);
                  }}
                  data-no-drag="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default ClipboardView;
