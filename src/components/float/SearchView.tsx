import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CircleCheck,
  Clipboard,
  CornerDownLeft,
  Globe,
  Inbox,
  Lock,
  LogOut,
  MicOff,
  Moon,
  MoonStar,
  Power,
  RotateCw,
  ScanText,
  Search,
  Settings as SettingsIcon,
  StickyNote,
  Sun,
  Target,
  Trash2,
} from "lucide-react";
import { useTasks, Task } from "../../activities/tasksStore";
import { Note, noteTitle, useNotes } from "../../activities/notesStore";
import { focus } from "../../activities/focusStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ClipboardEntry,
  copyClipboardEntry,
  getClipboardHistory,
  getShelf,
  openShelfItem,
  runSystemCommand,
  ShelfItem,
  SystemCommand,
  textgrabStart,
  getSearchIcon,
  isSearchReady,
  openSearchResult,
  searchEverything,
  SearchKind,
  SearchResult,
} from "../../platform";
import { quickAnswer } from "../../search/quickAnswer";
import { AppIcon } from "./AppIcon";
import "./SearchView.css";

const RESULT_LIMIT = 8;
const RECENT_LIMIT = 5;
const USAGE_KEY = "float_search_usage_v1";
const DEBOUNCE_MS = 50;

// --- What the user opens, so habits rank first ---------------------------------

interface Usage {
  count: number;
  last: number;
  result: SearchResult;
}

function loadUsage(): Record<string, Usage> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function recordUsage(result: SearchResult) {
  const usage = loadUsage();
  const prev = usage[result.target];
  usage[result.target] = { count: (prev?.count ?? 0) + 1, last: Date.now(), result };
  // Keep the 60 most recent.
  const kept = Object.entries(usage)
    .sort((a, b) => b[1].last - a[1].last)
    .slice(0, 60);
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Not persisted; ranking just won't learn this time.
  }
}

// --- Icons -------------------------------------------------------------------------

const fileIcons = new Map<string, string | null>();

const FileIcon: React.FC<{ path: string }> = ({ path }) => {
  const [url, setUrl] = useState<string | null>(() => fileIcons.get(path) ?? null);
  useEffect(() => {
    if (fileIcons.has(path)) {
      setUrl(fileIcons.get(path) ?? null);
      return;
    }
    let cancelled = false;
    getSearchIcon(path).then((b64) => {
      const next = b64 ? `data:image/png;base64,${b64}` : null;
      fileIcons.set(path, next);
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url ? <img className="search-icon-img" src={url} alt="" draggable={false} /> : <span className="search-icon-blank" />;
};

const ResultIcon: React.FC<{ result: SearchResult }> = ({ result }) => {
  switch (result.kind) {
    case "app":
      return <AppIcon appId={result.target} appName={result.name} size={24} />;
    case "setting":
      return (
        <span className="search-icon-tile settings">
          <SettingsIcon size={14} strokeWidth={2.2} />
        </span>
      );
    default:
      return <FileIcon path={result.target} />;
  }
};

const KIND_LABEL: Record<SearchKind, string> = {
  app: "Open",
  setting: "Open",
  folder: "Open",
  file: "Open",
};

// --- The view ----------------------------------------------------------------------

/** "focus", "focus 50", "focus write report 25m" -> a session to start. */
function focusCommand(query: string): { title: string; minutes: number } | null {
  const m = query.trim().match(/^focus\b\s*(.*?)\s*(?:(\d{1,3})\s*(?:m|min|mins|minutes)?)?$/i);
  if (!m) return null;
  const minutes = m[2] ? Math.min(240, Math.max(1, parseInt(m[2], 10))) : 25;
  return { title: m[1].trim(), minutes };
}

// Typed to find Copy Text from Anything.
const GRAB_WORDS = /^(copy( t(e(xt?)?)?)?|copy text from.*|text|ocr|live text|grab( text)?|scan( text)?)$/i;

// --- Commands --------------------------------------------------------------------

interface Command {
  id: SystemCommand;
  title: string;
  detail: string;
  words: string[];
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Ask for a second Enter before acting. */
  confirm?: boolean;
}

const COMMANDS: Command[] = [
  { id: "lock", title: "Lock screen", detail: "Command", words: ["lock", "lock screen"], Icon: Lock },
  { id: "sleep", title: "Sleep", detail: "Command", words: ["sleep"], Icon: Moon },
  { id: "restart", title: "Restart", detail: "Command", words: ["restart", "reboot"], Icon: RotateCw, confirm: true },
  { id: "shutdown", title: "Shut down", detail: "Command", words: ["shut down", "shutdown", "power off", "turn off"], Icon: Power, confirm: true },
  { id: "signout", title: "Sign out", detail: "Command", words: ["sign out", "log out", "logout", "signout"], Icon: LogOut, confirm: true },
  { id: "dark", title: "Dark mode", detail: "Switch Windows to dark", words: ["dark", "dark mode", "dark theme"], Icon: MoonStar },
  { id: "light", title: "Light mode", detail: "Switch Windows to light", words: ["light", "light mode", "light theme"], Icon: Sun },
  { id: "recyclebin", title: "Empty Recycle Bin", detail: "Windows asks first", words: ["empty recycle bin", "recycle bin", "empty trash", "trash"], Icon: Trash2 },
  { id: "mic", title: "Mute or unmute microphone", detail: "Command", words: ["mute mic", "mic", "microphone", "unmute"], Icon: MicOff },
];

function matchCommands(q: string): Command[] {
  const query = q.toLowerCase();
  if (query.length < 2) return [];
  return COMMANDS.filter((c) => c.words.some((w) => w.startsWith(query) || query.startsWith(w + " ")));
}

/** Case-insensitive "contains", with the matching text first ranked higher. */
const contains = (text: string, q: string) => text.toLowerCase().includes(q.toLowerCase());

type Row =
  | { type: "command"; command: Command }
  | { type: "clip"; entry: ClipboardEntry }
  | { type: "tray"; item: ShelfItem }
  | { type: "task"; task: Task }
  | { type: "note"; note: Note }
  | { type: "grab" }
  | { type: "focus"; title: string; minutes: number }
  | { type: "answer"; expression: string; value: string; kind: "math" | "convert" }
  | { type: "result"; result: SearchResult }
  | { type: "web"; query: string };

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

interface SearchViewProps {
  /** Typed before search opened (type-to-search from another tab). */
  initialQuery?: string;
  /** Close the island after opening something. */
  onDone: () => void;
  /** Esc with an empty field. */
  onExit: () => void;
  /** Open a task or note in its tab. */
  onNavigate?: (target: "tasks" | "notes", noteId?: string) => void;
  hotkey?: string | null;
}

/** Spotlight for the island: apps, Settings, files, maths and conversions. */
export const SearchView: React.FC<SearchViewProps> = ({ initialQuery = "", onDone, onExit, onNavigate = () => {}, hotkey }) => {
  const [query, setQuery] = useState(initialQuery);
  // Your own things: clipboard history, the Tray, tasks and notes.
  const [clips, setClips] = useState<ClipboardEntry[]>([]);
  const [tray, setTray] = useState<ShelfItem[]>([]);
  const tasks = useTasks();
  const notes = useNotes();
  // A command waiting for its confirming second Enter.
  const [armed, setArmed] = useState<SystemCommand | null>(null);
  const [copiedClip, setCopiedClip] = useState<number | null>(null);
  useEffect(() => {
    getClipboardHistory().then(setClips);
    getShelf().then(setTray);
  }, []);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [ready, setReady] = useState(true);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    // Put the caret after anything typed before the view opened.
    const len = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(len, len);
  }, []);

  const recents = useMemo(
    () =>
      Object.values(loadUsage())
        .sort((a, b) => b.last - a.last)
        .slice(0, RECENT_LIMIT)
        .map((u) => u.result),
    // Re-read when the field is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query === ""]
  );

  useEffect(() => {
    const id = ++requestRef.current;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const usage = loadUsage();
      const boosts = Object.fromEntries(Object.entries(usage).map(([t, u]) => [t, Math.min(30, u.count * 6)]));
      const [found, isReady] = await Promise.all([searchEverything(q, RESULT_LIMIT, boosts), isSearchReady()]);
      if (id !== requestRef.current) return;
      setResults(found);
      setReady(isReady);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const answer = useMemo(() => quickAnswer(query), [query]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim();
    if (!q) return recents.map((result) => ({ type: "result" as const, result }));
    const list: Row[] = [];
    if (GRAB_WORDS.test(q)) list.push({ type: "grab" });
    const session = focusCommand(q);
    if (session) list.push({ type: "focus", ...session });
    list.push(...matchCommands(q).map((command) => ({ type: "command" as const, command })));
    if (answer) list.push({ type: "answer", ...answer });
    const native = results.map((result) => ({ type: "result" as const, result }));
    // A few best app/file hits, then your own things, then the rest.
    list.push(...native.slice(0, 3));
    if (q.length >= 2) {
      list.push(
        ...clips.filter((c) => c.kind === "text" && c.text && contains(c.text, q)).slice(0, 2).map((entry) => ({ type: "clip" as const, entry })),
        ...tray.filter((t) => contains(t.name, q)).slice(0, 2).map((item) => ({ type: "tray" as const, item })),
        ...tasks.filter((t) => contains(t.title, q)).slice(0, 2).map((task) => ({ type: "task" as const, task })),
        ...notes.filter((n) => contains(n.text, q)).slice(0, 2).map((note) => ({ type: "note" as const, note }))
      );
    }
    list.push(...native.slice(3));
    list.push({ type: "web", query: q });
    return list;
  }, [query, recents, answer, results, clips, tray, tasks, notes]);

  useEffect(() => {
    setSelected(0);
    setCopied(false);
    setCopiedClip(null);
  }, [query]);

  // Moving off an armed command disarms it.
  useEffect(() => setArmed(null), [query, selected]);

  // Keep the selection in view while arrowing through.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const activate = useCallback(
    (row: Row | undefined, reveal = false) => {
      if (!row) return;
      if (row.type === "command") {
        if (row.command.confirm && armed !== row.command.id) {
          setArmed(row.command.id);
          return;
        }
        runSystemCommand(row.command.id).catch(() => {});
        onDone();
        return;
      }
      if (row.type === "clip") {
        copyClipboardEntry(row.entry.id).then(() => setCopiedClip(row.entry.id));
        return;
      }
      if (row.type === "tray") {
        openShelfItem(row.item.path);
        onDone();
        return;
      }
      if (row.type === "task") {
        onNavigate("tasks");
        return;
      }
      if (row.type === "note") {
        onNavigate("notes", row.note.id);
        return;
      }
      if (row.type === "grab") {
        onDone();
        // Let the island close first, so it isn't in the frozen screenshot.
        setTimeout(() => textgrabStart(), 380);
        return;
      }
      if (row.type === "focus") {
        focus.start(row.title, row.minutes);
        onDone();
        return;
      }
      if (row.type === "answer") {
        copyText(row.value);
        setCopied(true);
        return;
      }
      if (row.type === "web") {
        openUrl(`https://www.bing.com/search?q=${encodeURIComponent(row.query)}`).catch(() => {});
        onDone();
        return;
      }
      const canReveal = row.result.kind === "file" || row.result.kind === "folder";
      recordUsage(row.result);
      openSearchResult(row.result.target, reveal && canReveal);
      onDone();
    },
    [onDone, onNavigate, armed]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Keys belong to the field, not the island's own shortcuts.
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(rows.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(rows[selected], e.ctrlKey || e.altKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) setQuery("");
      else onExit();
    }
  };

  const showEmptyHint = !query.trim() && rows.length === 0;

  return (
    <div className="view search-view">
      <label className="search-field" onClick={(e) => e.stopPropagation()}>
        <Search size={16} strokeWidth={2.2} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search apps, files and settings"
          aria-label="Search"
          spellCheck={false}
          autoComplete="off"
          data-no-drag="true"
        />
        {hotkey && !query && <kbd className="search-kbd">{hotkey}</kbd>}
      </label>

      <div className="search-results" ref={listRef} role="listbox" aria-label="Results">
        {!query.trim() && rows.length > 0 && <div className="search-section">Recent</div>}
        {rows.map((row, i) => {
          const isSelected = i === selected;
          const key =
            row.type === "result"
              ? row.result.target
              : row.type === "command"
              ? `cmd:${row.command.id}`
              : row.type === "clip"
              ? `clip:${row.entry.id}`
              : row.type === "tray"
              ? `tray:${row.item.path}`
              : row.type === "task"
              ? `task:${row.task.id}`
              : row.type === "note"
              ? `note:${row.note.id}`
              : row.type;
          const common = {
            "data-row": i,
            role: "option",
            "aria-selected": isSelected,
            className: `search-row ${isSelected ? "selected" : ""} ${row.type}`,
            onMouseMove: () => !isSelected && setSelected(i),
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              activate(row, e.ctrlKey || e.altKey);
            },
            "data-no-drag": "true",
          };
          // Your own things and commands share one simple row.
          const simple =
            row.type === "command"
              ? {
                  Icon: row.command.Icon,
                  tile: armed === row.command.id ? "danger" : "command",
                  name: armed === row.command.id ? `Press Enter again to ${row.command.title.toLowerCase()}` : row.command.title,
                  detail: row.command.detail,
                  hint: armed === row.command.id ? "Confirm" : "Run",
                }
              : row.type === "clip"
              ? { Icon: Clipboard, tile: "clip", name: row.entry.text!.replace(/\s+/g, " ").slice(0, 120), detail: "Clipboard history", hint: copiedClip === row.entry.id ? "Copied" : "Copy" }
              : row.type === "tray"
              ? { Icon: Inbox, tile: "tray", name: row.item.name, detail: "In the Tray", hint: "Open" }
              : row.type === "task"
              ? { Icon: CircleCheck, tile: "task", name: row.task.title, detail: row.task.done ? "Task · done" : "Task", hint: "Show" }
              : row.type === "note"
              ? { Icon: StickyNote, tile: "note", name: noteTitle(row.note), detail: "Note", hint: "Open" }
              : null;
          if (simple) {
            const { Icon } = simple;
            return (
              <div key={key} {...common}>
                <span className={`search-icon-tile ${simple.tile}`}>
                  <Icon size={14} strokeWidth={2.2} />
                </span>
                <span className="search-text">
                  <span className="search-name">{simple.name}</span>
                  <span className="search-detail">{simple.detail}</span>
                </span>
                {isSelected && (
                  <span className="search-hint">
                    {simple.hint}
                    <CornerDownLeft size={12} />
                  </span>
                )}
              </div>
            );
          }
          if (row.type === "grab") {
            return (
              <div key={key} {...common}>
                <span className="search-icon-tile web">
                  <ScanText size={14} strokeWidth={2.2} />
                </span>
                <span className="search-text">
                  <span className="search-name">Copy text from the screen</span>
                  <span className="search-detail">Drag over any text, even in images and videos</span>
                </span>
                {isSelected && <CornerDownLeft className="search-enter" size={13} />}
              </div>
            );
          }
          if (row.type === "focus") {
            return (
              <div key={key} {...common}>
                <span className="search-icon-tile focus">
                  <Target size={14} strokeWidth={2.2} />
                </span>
                <span className="search-text">
                  <span className="search-name">Start a {row.minutes}-minute focus session</span>
                  {row.title && <span className="search-detail">{row.title}</span>}
                </span>
                {isSelected && <CornerDownLeft className="search-enter" size={13} />}
              </div>
            );
          }
          if (row.type === "answer") {
            return (
              <div key={key} {...common}>
                <span className="search-icon-tile answer">
                  <Calculator size={14} strokeWidth={2.2} />
                </span>
                <span className="search-text">
                  <span className="search-answer-value">{row.value}</span>
                  <span className="search-detail">{row.expression}</span>
                </span>
                {isSelected && <span className="search-hint">{copied ? "Copied" : "Copy"}</span>}
              </div>
            );
          }
          if (row.type === "web") {
            return (
              <div key={key} {...common}>
                <span className="search-icon-tile web">
                  <Globe size={14} strokeWidth={2.2} />
                </span>
                <span className="search-text">
                  <span className="search-name">Search the web for “{row.query}”</span>
                </span>
                {isSelected && <CornerDownLeft className="search-enter" size={13} />}
              </div>
            );
          }
          if (row.type !== "result") return null;
          const { result } = row;
          return (
            <div key={key} {...common} title={result.kind === "file" || result.kind === "folder" ? result.target : undefined}>
              <span className="search-icon">
                <ResultIcon result={result} />
              </span>
              <span className="search-text">
                <span className="search-name">{result.name}</span>
                <span className="search-detail">{result.detail}</span>
              </span>
              {isSelected && (
                <span className="search-hint">
                  {KIND_LABEL[result.kind]}
                  <CornerDownLeft size={12} />
                </span>
              )}
            </div>
          );
        })}
        {showEmptyHint && (
          <div className="view-empty">Type to find an app, a file, a setting, or do a quick sum like 12% of 80</div>
        )}
        {query.trim() && !ready && results.length === 0 && <div className="search-section">Indexing your files…</div>}
      </div>
    </div>
  );
};

export default SearchView;
