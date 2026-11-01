import React, { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { ALL_SECTIONS, requestUpdateCheck, Section, SECTIONS } from "./pages";
import { HighlightContext } from "./controls";
import "./settings.css";

const win = () => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
};

/** Red, yellow, green: close, minimise, zoom. */
const TrafficLights: React.FC = () => (
  <div className="lights">
    <button type="button" className="light close" aria-label="Close" onClick={() => win()?.close()}>
      <svg viewBox="0 0 12 12">
        <path d="M3.8 3.8l4.4 4.4M8.2 3.8l-4.4 4.4" stroke="rgba(77,0,0,.75)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
    <button type="button" className="light min" aria-label="Minimise" onClick={() => win()?.minimize()}>
      <svg viewBox="0 0 12 12">
        <path d="M3.2 6h5.6" stroke="rgba(99,62,0,.75)" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
    <button type="button" className="light max" aria-label="Zoom" onClick={() => win()?.toggleMaximize()}>
      <svg viewBox="0 0 12 12">
        <path d="M3.6 7.9V4.6l3.3 3.3zM8.4 4.1v3.3L5.1 4.1z" fill="rgba(0,70,0,.75)" />
      </svg>
    </button>
  </div>
);

const Tile: React.FC<{ section: Section; size?: number }> = ({ section, size = 14 }) => (
  <span className="sw-icon" style={{ background: `linear-gradient(180deg, ${section.tile[0]}, ${section.tile[1]})` }}>
    <section.Icon size={size} strokeWidth={2.2} color="#fff" />
  </span>
);

/** "general", or "updates-check" (open Updates and check right away). */
function parseSection(raw: string): string {
  if (raw === "updates-check") {
    requestUpdateCheck();
    return "updates";
  }
  return ALL_SECTIONS.some((s) => s.id === raw) ? raw : "general";
}

export const SettingsApp: React.FC = () => {
  const material = new URLSearchParams(location.search).get("material") ?? "solid";
  const [current, setCurrent] = useState(() => parseSection(location.hash.replace(/^#settings\/?/, "")));
  const [history, setHistory] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const go = (id: string, row: string | null = null) => {
    if (id !== current) {
      setHistory((h) => [...h, current]);
      setForward([]);
      setCurrent(id);
      scrollRef.current?.scrollTo({ top: 0 });
    }
    setHighlight(null);
    if (row) requestAnimationFrame(() => setHighlight(row));
  };

  useEffect(() => {
    const w = win();
    // Shown once painted, so the window never flashes empty.
    requestAnimationFrame(() => {
      w?.show().then(() => w.setFocus()).catch(() => {});
    });
    const unFocus = w?.onFocusChanged((e) => setFocused(e.payload));
    const unSection = listen<string>("settings-section", (e) => go(parseSection(e.payload)));
    return () => {
      unFocus?.then((fn) => fn());
      unSection.then((fn) => fn()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search: settings whose name or keywords match, by section.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out = new Map<string, string | null>();
    for (const s of ALL_SECTIONS) {
      if (s.title.toLowerCase().includes(q)) out.set(s.id, null);
      const row = s.rows.find(([, label, words]) => `${label} ${words ?? ""}`.toLowerCase().includes(q));
      if (row && !out.get(s.id)) out.set(s.id, row[0]);
    }
    return out;
  }, [query]);

  const section = ALL_SECTIONS.find((s) => s.id === current) ?? ALL_SECTIONS[0];

  return (
    <div className={`sw ${material} ${focused ? "" : "blurred"}`}>
      <aside className="sw-sidebar">
        <div className="sw-titlebar" data-tauri-drag-region>
          <TrafficLights />
        </div>
        <label className="sw-search">
          <Search size={13} strokeWidth={2.4} />
          <input
            value={query}
            placeholder="Search"
            aria-label="Search settings"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && matches?.size) {
                const [id, row] = [...matches.entries()][0];
                go(id, row);
              }
            }}
          />
        </label>
        <nav className="sw-nav">
          {SECTIONS.map((group, gi) => (
            <div key={gi} className="sw-nav-group">
              {group.map((s) => {
                const hit = !matches || matches.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`sw-item ${s.id === current ? "on" : ""} ${hit ? "" : "dim"}`}
                    onClick={() => go(s.id, matches?.get(s.id) ?? null)}
                  >
                    <Tile section={s} />
                    {s.title}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="sw-main">
        <div className="sw-toolbar" data-tauri-drag-region>
          <button
            type="button"
            className="sw-nav-btn"
            aria-label="Back"
            disabled={!history.length}
            onClick={() => {
              const prev = history[history.length - 1];
              setHistory((h) => h.slice(0, -1));
              setForward((f) => [current, ...f]);
              setCurrent(prev);
            }}
          >
            <ChevronLeft size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="sw-nav-btn"
            aria-label="Forward"
            disabled={!forward.length}
            onClick={() => {
              const [next, ...rest] = forward;
              setForward(rest);
              setHistory((h) => [...h, current]);
              setCurrent(next);
            }}
          >
            <ChevronRight size={17} strokeWidth={2.2} />
          </button>
          <h1 data-tauri-drag-region>{section.title}</h1>
        </div>
        <div className="sw-scroll" ref={scrollRef}>
          <div className="sw-page" key={section.id}>
            <div className="sw-hero">
              <Tile section={section} size={28} />
              <div>
                <h2>{section.title}</h2>
                <p>{section.blurb}</p>
              </div>
            </div>
            <HighlightContext.Provider value={highlight}>
              <section.Page />
            </HighlightContext.Provider>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsApp;
