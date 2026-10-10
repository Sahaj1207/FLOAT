import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { taskList, useTasks } from "../../activities/tasksStore";
import "./TasksView.css";

/** To-do list: type, Enter, tick off. Open tasks first, finished ones below. */
export const TasksView: React.FC = () => {
  const tasks = useTasks();
  const [draft, setDraft] = useState("");
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="view tasks-view">
      <div className="view-header">
        <span className="view-title">Tasks</span>
        <span className="view-hint">{tasks.length === 0 ? "" : open.length === 0 ? "All done" : `${open.length} to do`}</span>
        {done.length > 0 && (
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
    </div>
  );
};

export default TasksView;
