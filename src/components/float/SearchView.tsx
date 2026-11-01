import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, CornerDownLeft, Globe, Search, Settings as SettingsIcon, Target } from "lucide-react";
import { focus } from "../../activities/focusStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
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

type Row =
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
  hotkey?: string | null;
}

/** Spotlight for the island: apps, Settings, files, maths and conversions. */
export const SearchView: React.FC<SearchViewProps> = ({ initialQuery = "", onDone, onExit, hotkey }) => {
  const [query, setQuery] = useState(initialQuery);
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
    const session = focusCommand(q);
    if (session) list.push({ type: "focus", ...session });
    if (answer) list.push({ type: "answer", ...answer });
    list.push(...results.map((result) => ({ type: "result" as const, result })));
    list.push({ type: "web", query: q });
    return list;
  }, [query, recents, answer, results]);

  useEffect(() => {
    setSelected(0);
    setCopied(false);
  }, [query]);

  // Keep the selection in view while arrowing through.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const activate = useCallback(
    (row: Row | undefined, reveal = false) => {
      if (!row) return;
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
    [onDone]
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
          const key = row.type === "result" ? row.result.target : row.type;
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
