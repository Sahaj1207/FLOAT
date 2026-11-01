import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, ClipboardPaste, CornerDownLeft, Pin, PinOff } from "lucide-react";
import {
  ClipboardEntry,
  copyClipboardEntry,
  getClipboardHistory,
  pasteHistoryEntry,
  pasteText,
  subscribeToClipboard,
} from "../../platform";
import { Snippet, snippetList, useSnippets } from "../../activities/snippetsStore";
import "./SearchView.css";
import "./PasteView.css";

type Item = { type: "snippet"; snippet: Snippet } | { type: "clip"; entry: ClipboardEntry };

const textOf = (item: Item) => (item.type === "snippet" ? item.snippet.text : item.entry.text ?? "");
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/**
 * The paste picker (Ctrl+Alt+V): pinned snippets, then clipboard history.
 * Type to filter, arrows to choose, Enter (or 1-9) pastes into the app you
 * were in. Ctrl+P pins or unpins.
 */
export const PasteView: React.FC<{ onDone: () => void; onExit: () => void; hotkey?: string | null }> = ({ onDone, onExit, hotkey }) => {
  const [query, setQuery] = useState("");
  const [clips, setClips] = useState<ClipboardEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const snippets = useSnippets();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let live = true;
    getClipboardHistory().then((list) => live && setClips(list));
    const unlisten = subscribeToClipboard((list) => live && setClips(list));
    return () => {
      live = false;
      unlisten.then((fn) => fn());
    };
  }, []);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pinnedTexts = new Set(snippets.map((s) => s.text));
    const list: Item[] = [
      ...snippets.map((snippet) => ({ type: "snippet" as const, snippet })),
      // History, minus things already pinned.
      ...clips.filter((c) => !(c.kind === "text" && pinnedTexts.has(c.text ?? ""))).map((entry) => ({ type: "clip" as const, entry })),
    ];
    if (!q) return list;
    return list.filter((item) => item.type === "snippet" || item.entry.kind === "text" ? textOf(item).toLowerCase().includes(q) : false);
  }, [query, clips, snippets]);

  useEffect(() => setSelected(0), [query]);

  // Keys pressed while the field isn't focused (e.g. after a click) are
  // handled the same way, and focus returns to the field.
  const keyHandlerRef = useRef<(e: KeyboardEvent | React.KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      inputRef.current?.focus();
      // Typing characters lands in the field; everything else is ours.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey) keyHandlerRef.current(e);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 1400);
    return () => clearTimeout(t);
  }, [note]);

  const paste = (item: Item | undefined) => {
    if (!item) return;
    const pasted = item.type === "snippet" ? pasteText(item.snippet.text) : pasteHistoryEntry(item.entry.id);
    onDone();
    pasted.then((ok) => {
      // No app to paste into: it's on the clipboard instead.
      if (!ok && item.type === "clip") copyClipboardEntry(item.entry.id);
    });
  };

  const togglePin = (item: Item | undefined) => {
    if (!item) return;
    if (item.type === "snippet") {
      snippetList.unpin(item.snippet.id);
      setNote("Unpinned");
    } else if (item.entry.kind === "text" && item.entry.text) {
      snippetList.pin(item.entry.text);
      setNote("Pinned");
    }
  };

  const onKeyDown = (e: KeyboardEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      paste(items[selected]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) setQuery("");
      else onExit();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      togglePin(items[selected]);
    } else if (!query && /^[1-9]$/.test(e.key)) {
      // Quick paste by number, while not typing a filter.
      e.preventDefault();
      paste(items[Number(e.key) - 1]);
    }
  };

  keyHandlerRef.current = onKeyDown;

  const firstClip = items.findIndex((i) => i.type === "clip");

  return (
    <div className="view search-view paste-view" onClick={(e) => e.stopPropagation()}>
      <label className="search-field">
        <ClipboardPaste size={16} strokeWidth={2.2} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Paste from clipboard history or a pinned snippet"
          aria-label="Filter clipboard"
          spellCheck={false}
          autoComplete="off"
          data-no-drag="true"
        />
        {note ? <span className="paste-note">{note}</span> : hotkey && !query && <kbd className="search-kbd">{hotkey}</kbd>}
      </label>

      <div className="search-results" ref={listRef} role="listbox" aria-label="Clipboard">
        {items.length === 0 && (
          <div className="view-empty">{query ? "Nothing matches" : "Copy something and it appears here. Pin what you paste often with Ctrl+P"}</div>
        )}
        {items.map((item, i) => {
          const isSelected = i === selected;
          const isImage = item.type === "clip" && item.entry.kind === "image";
          return (
            <React.Fragment key={item.type === "snippet" ? `s:${item.snippet.id}` : `c:${item.entry.id}`}>
              {i === 0 && item.type === "snippet" && <div className="search-section">Pinned</div>}
              {i === firstClip && <div className="search-section">Recent</div>}
              <div
                data-row={i}
                role="option"
                aria-selected={isSelected}
                className={`search-row ${isSelected ? "selected" : ""}`}
                onMouseMove={() => !isSelected && setSelected(i)}
                // Keep focus in the field, so the keyboard keeps working.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => paste(item)}
                data-no-drag="true"
              >
                {isImage && item.type === "clip" && item.entry.thumb ? (
                  <img className="paste-thumb" src={`data:image/png;base64,${item.entry.thumb}`} alt="" draggable={false} />
                ) : (
                  <span className={`search-icon-tile ${item.type === "snippet" ? "pin" : "clip"}`}>
                    {item.type === "snippet" ? <Pin size={13} strokeWidth={2.4} /> : <Clipboard size={13} strokeWidth={2.2} />}
                  </span>
                )}
                <span className="search-text">
                  <span className="search-name">
                    {isImage && item.type === "clip" ? `Image ${item.entry.width ?? ""}×${item.entry.height ?? ""}` : oneLine(textOf(item)).slice(0, 160)}
                  </span>
                  <span className="search-detail">
                    {item.type === "snippet" ? "Pinned" : timeAgo(item.entry.at)}
                    {!query && i < 9 ? ` · ${i + 1}` : ""}
                  </span>
                </span>
                {isSelected && (
                  <span className="search-hint">
                    {!isImage && (
                      <button
                        type="button"
                        className="paste-pin"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(item);
                        }}
                        data-no-drag="true"
                        aria-label={item.type === "snippet" ? "Unpin" : "Pin"}
                        title={item.type === "snippet" ? "Unpin (Ctrl+P)" : "Pin (Ctrl+P)"}
                      >
                        {item.type === "snippet" ? <PinOff size={12} strokeWidth={2.4} /> : <Pin size={12} strokeWidth={2.4} />}
                      </button>
                    )}
                    Paste
                    <CornerDownLeft size={12} />
                  </span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
