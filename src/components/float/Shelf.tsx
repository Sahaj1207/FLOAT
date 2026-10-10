import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  addToShelf,
  clearShelf,
  dragShelfItemOut,
  getShelf,
  getShelfThumbnail,
  openShelfItem,
  removeFromShelf,
  ShelfItem,
} from "../../platform";
import { Inbox, Search, X } from "lucide-react";
import "./Shelf.css";

/* ---- Shared shelf store (the notch adds; the Shelf tab shows) ---------------- */

let items: ShelfItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function setItems(next: ShelfItem[]) {
  items = next;
  listeners.forEach((l) => l());
}

export const shelf = {
  add: (paths: string[]) => addToShelf(paths).then(setItems),
  remove: (path: string) => removeFromShelf(path).then(setItems),
  clear: () => clearShelf().then(setItems),
};

export function useShelf(): ShelfItem[] {
  useEffect(() => {
    if (!loaded) {
      loaded = true;
      getShelf().then(setItems);
    }
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => items
  );
}

/* ---- Thumbnails ----------------------------------------------------------------- */

const thumbCache = new Map<string, string | null>();

function useThumbnail(path: string): string | null {
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(path) ?? null);
  useEffect(() => {
    if (thumbCache.has(path)) {
      setUrl(thumbCache.get(path) ?? null);
      return;
    }
    let cancelled = false;
    getShelfThumbnail(path).then((b64) => {
      const value = b64 ? `data:image/png;base64,${b64}` : null;
      thumbCache.set(path, value);
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

/* ---- Views ------------------------------------------------------------------------ */

const DRAG_THRESHOLD = 6;

const ShelfTile: React.FC<{ item: ShelfItem }> = ({ item }) => {
  const thumb = useThumbnail(item.path);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
      className="shelf-tile"
      title={item.path}
      data-no-drag="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        start.current = { x: e.clientX, y: e.clientY };
        dragging.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || dragging.current) return;
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD) {
          dragging.current = true;
          start.current = null;
          dragShelfItemOut(item.path);
        }
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        openShelfItem(item.path);
      }}
    >
      <div className="shelf-thumb">
        {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="shelf-thumb-fallback">{item.isDir ? "📁" : "📄"}</span>}
      </div>
      <span className="shelf-name">{item.name}</span>
      <div className="shelf-actions">
        <button
          type="button"
          title="Show in Explorer"
          aria-label="Show in Explorer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openShelfItem(item.path, true);
          }}
          data-no-drag="true"
        >
          <Search strokeWidth={2.4} />
        </button>
        <button
          type="button"
          title="Remove from Shelf"
          aria-label="Remove from Shelf"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            shelf.remove(item.path);
          }}
          data-no-drag="true"
        >
          <X strokeWidth={2.6} />
        </button>
      </div>
    </motion.div>
  );
};

export const TrayIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <Inbox className={className} strokeWidth={2} />
);

export const ShelfView: React.FC<{ header?: React.ReactNode }> = ({ header }) => {
  const list = useShelf();
  return (
    <div className="view shelf-view">
      <div className="view-header">
        {header ?? <span className="view-title">Files</span>}
        <span className="view-hint" />
        {list.length > 0 && (
          <button
            type="button"
            className="view-action"
            onClick={(e) => {
              e.stopPropagation();
              shelf.clear();
            }}
            data-no-drag="true"
          >
            Clear
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <div className="shelf-empty">
          <TrayIcon className="shelf-empty-icon" />
          <span>Drop files on the notch to keep them here</span>
        </div>
      ) : (
        <div className="shelf-row">
          <AnimatePresence initial={false}>
            {list.map((item) => (
              <ShelfTile key={item.path} item={item} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

/** Notch content while files are dragged over it. */
export const DropZone: React.FC<{ count: number }> = ({ count }) => (
  <div className="shelf-dropzone">
    <TrayIcon className="shelf-dropzone-icon" />
    <span>{count > 1 ? `Drop ${count} items on the Shelf` : "Drop on the Shelf"}</span>
  </div>
);
