import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Target, X } from "lucide-react";
import { focus } from "../../activities/focusStore";
import { taskList, useTasks } from "../../activities/tasksStore";
import { NotesView } from "./NotesView";
import "./TasksView.css";

export type TasksMode = "tasks" | "notes";
const MODE_KEY = "float_tasks_mode_v1";

function loadMode(): TasksMode {
  try {
    return localStorage.getItem(MODE_KEY) === "notes" ? "notes" : "tasks";
  } catch {
    return "tasks";
  }
}

/**
 * Tasks and Quick Notes share a tab: a to-do list (type, Enter, tick off)
 * and a scratchpad. Opens on whichever was used last.
 */
export const TasksView: React.FC<{ mode?: TasksMode; noteId?: string | null }> = ({ mode: requested, noteId = null }) => {
  const tasks = useTasks();
  const [draft, setDraft] = useState("");
  const [mode, setModeState] = useState<TasksMode>(() => requested ?? loadMode());
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const setMode = (next: TasksMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Not remembered.
    }
  };

  return (
    <div className="view tasks-view">
      <div className="view-header">
        <div className="segmented" role="tablist" aria-label="Tasks or notes">
          {(["tasks", "notes"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "active" : ""}
              onClick={(e) => {
                e.stopPropagation();
                setMode(m);
              }}
              data-no-drag="true"
            >
              {m === "tasks" ? "Tasks" : "Notes"}
            </button>
          ))}
        </div>
        {mode === "tasks" && (
          <span className="view-hint">{tasks.length === 0 ? "" : open.length === 0 ? "All done" : `${open.length} to do`}</span>
        )}
        {mode === "tasks" && done.length > 0 && (
          <button
            type="button"
            className="view-action"
            onClick={(e) => {
              e.stopPropagation();
              taskList.clearDone();
            }}
            data-no-drag="true"
          >
            Clear done
          </button>
        )}
      </div>

      {mode === "notes" ? (
        <NotesView focusNoteId={noteId} />
      ) : (
      <>
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          taskList.add(draft);
          setDraft("");
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="task-check ghost" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="New task"
          aria-label="New task"
          spellCheck={false}
          data-no-drag="true"
        />
      </form>

      <div className="task-list">
        <AnimatePresence initial={false}>
          {[...open, ...done].map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
              className={`task-row ${task.done ? "done" : ""}`}
            >
              <button
                type="button"
                className={`task-check ${task.done ? "checked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  taskList.toggle(task.id);
                }}
                data-no-drag="true"
                aria-label={task.done ? "Mark as not done" : "Mark as done"}
              >
                {task.done && <Check size={11} strokeWidth={3.2} />}
              </button>
              <span className="task-title">{task.title}</span>
              {!task.done && (
                <button
                  type="button"
                  className="task-remove task-focus"
                  onClick={(e) => {
                    e.stopPropagation();
                    focus.start(task.title, 25, task.id);
                  }}
                  data-no-drag="true"
                  aria-label="Focus on this for 25 minutes"
                  title="Focus on this for 25 minutes"
                >
                  <Target size={12} strokeWidth={2.4} />
                </button>
              )}
              <button
                type="button"
                className="task-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  taskList.remove(task.id);
                }}
                data-no-drag="true"
                aria-label="Delete task"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </>
      )}
    </div>
  );
};

export default TasksView;
