import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Copy, Check, SquarePen, Trash2 } from "lucide-react";
import { noteList, useNotes } from "../../activities/notesStore";
import "./NotesView.css";

const swap = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const };

/** "Today 3:04 PM", "Yesterday", "Mon 2 Nov". */
function edited(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff === 0) return `Today ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Quick Notes: one note at a time, newest first. Type and it's saved; flip
 * through older notes with the arrows. Empty notes tidy themselves away.
 */
export const NotesView: React.FC<{ focusNoteId?: string | null }> = ({ focusNoteId = null }) => {
  const notes = useNotes();
  const [currentId, setCurrentId] = useState<string | null>(focusNoteId ?? notes[0]?.id ?? null);
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const index = Math.max(0, notes.findIndex((n) => n.id === currentId));
  const note = notes[index] ?? null;

  // Leaving the view drops notes that were never written in.
  useEffect(() => () => noteList.prune(), []);

  useEffect(() => {
    setCopied(false);
  }, [note?.id]);

  const newNote = () => {
    noteList.prune();
    const id = noteList.add();
    setCurrentId(id);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const go = (delta: number) => {
    noteList.prune();
    const list = noteList.all();
    const i = Math.max(0, list.findIndex((n) => n.id === note?.id));
    const next = list[Math.min(list.length - 1, Math.max(0, i + delta))];
    if (next) setCurrentId(next.id);
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="notes-view" onClick={(e) => e.stopPropagation()}>
      <div className="notes-bar">
        <button type="button" className="notes-icon-btn" onClick={stop(() => go(-1))} disabled={index <= 0} data-no-drag="true" aria-label="Newer note">
          <ChevronLeft size={15} strokeWidth={2.4} />
        </button>
        <span className="notes-meta">
          {note ? `${edited(note.updatedAt)} · ${index + 1} of ${notes.length}` : "No notes yet"}
        </span>
        <button
          type="button"
          className="notes-icon-btn"
          onClick={stop(() => go(1))}
          disabled={index >= notes.length - 1}
          data-no-drag="true"
          aria-label="Older note"
        >
          <ChevronRight size={15} strokeWidth={2.4} />
        </button>
        <span className="notes-spacer" />
        {note && note.text.trim() && (
          <>
            <button
              type="button"
              className="notes-icon-btn"
              onClick={stop(() => {
                navigator.clipboard.writeText(note.text).then(() => setCopied(true)).catch(() => {});
              })}
              data-no-drag="true"
              aria-label="Copy note"
              title="Copy"
            >
              {copied ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              className="notes-icon-btn danger"
              onClick={stop(() => {
                const list = noteList.all();
                const i = list.findIndex((n) => n.id === note.id);
                noteList.remove(note.id);
                const rest = noteList.all();
                setCurrentId(rest[Math.min(i, rest.length - 1)]?.id ?? null);
              })}
              data-no-drag="true"
              aria-label="Delete note"
              title="Delete"
            >
              <Trash2 size={14} strokeWidth={2.2} />
            </button>
          </>
        )}
        <button type="button" className="notes-icon-btn accent" onClick={stop(newNote)} data-no-drag="true" aria-label="New note" title="New note">
          <SquarePen size={14} strokeWidth={2.2} />
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {note ? (
          <motion.textarea
            key={note.id}
            ref={areaRef}
            className="notes-text"
            value={note.text}
            onChange={(e) => noteList.update(note.id, e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Jot something down…"
            spellCheck
            data-no-drag="true"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={swap}
          />
        ) : (
          <motion.button
            key="empty"
            type="button"
            className="notes-empty"
            onClick={stop(newNote)}
            data-no-drag="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={swap}
          >
            <SquarePen size={18} strokeWidth={2} />
            Start a note
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
