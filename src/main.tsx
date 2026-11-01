import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./index.css";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, applySettingsToDOM, applySettingsToNative, applySavedShortcuts } from "./services/settings";
import { flushToDisk, hydrateFromDisk } from "./services/persist";
import { listen } from "@tauri-apps/api/event";

// Copy Text's overlay and Settings are their own windows, loading this same page.
const isTextGrab = window.location.hash === "#textgrab";
const isSettings = window.location.hash.startsWith("#settings");

// FLOAT is an app, not a web page: the web engine's own shortcuts (print,
// save, find, reload, zoom, caret browsing...) must never fire. Editing keys
// (copy, paste, undo, select all) still work in text fields.
const BLOCKED_CTRL = new Set(["p", "s", "f", "g", "h", "j", "o", "r", "u", "n", "t", "w", "=", "+", "-", "0"]);
window.addEventListener(
  "keydown",
  (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if ((ctrl && BLOCKED_CTRL.has(key)) || ["F3", "F5", "F7", "F12"].includes(e.key) || (ctrl && e.shiftKey && key === "i")) {
      e.preventDefault();
    }
  },
  // Capture: before anything else sees it. Views still get the event (for
  // example Ctrl+P to pin in the paste picker); only the default is cancelled.
  true
);
// Ctrl + mouse wheel would zoom the whole island.
window.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });

async function start() {
  // Your saved data comes from disk first (see services/persist.ts).
  await hydrateFromDisk();
  applySettingsToDOM(loadSettings());
  // Native settings are applied once, by the island window.
  if (!isTextGrab && !isSettings) {
    applySettingsToNative(loadSettings());
    applySavedShortcuts(loadSettings());
  }
  const view = isTextGrab
    ? (await import("./components/textgrab/TextGrab")).TextGrab
    : isSettings
    ? (await import("./settings/SettingsApp")).SettingsApp
    : (await import("./App")).default;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>{React.createElement(view)}</React.StrictMode>
  );
}
window.addEventListener("beforeunload", flushToDisk);
// A restore in Settings: every window starts again from the restored files.
listen("float-data-restored", () => location.reload()).catch(() => {});

// Uncaught errors go to FLOAT's local log (Settings > About > Copy
// diagnostics), at most a few dozen per run.
let loggedErrors = 0;
const logError = (message: string) => {
  if (++loggedErrors > 40) return;
  invoke("log_js_error", { message: `${isSettings ? "[settings] " : isTextGrab ? "[copy text] " : ""}${message}` }).catch(() => {});
};
window.addEventListener("error", (e) => logError(`${e.message} at ${e.filename?.split("/").pop()}:${e.lineno}:${e.colno}`));
window.addEventListener("unhandledrejection", (e) => logError(`Unhandled: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));

// Redirect frontend logs to Rust stdout in development only. In release
// builds every console call would otherwise cost an IPC round-trip.
if (import.meta.env.DEV) {
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args) => {
    originalLog(...args);
    invoke("log_from_js", { msg: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(" ") }).catch(() => {});
  };

  console.error = (...args) => {
    originalError(...args);
    invoke("log_from_js", { msg: "[ERROR] " + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(" ") }).catch(() => {});
  };

  window.onerror = (message, source, lineno, colno, error) => {
    const msg = `UNCAUGHT ERROR: ${message} at ${source}:${lineno}:${colno} - ${error}`;
    invoke("log_from_js", { msg }).catch(() => {});
    return false;
  };

  // Also catch promise rejections
  window.onunhandledrejection = (event) => {
    const msg = `UNHANDLED REJECTION: ${event.reason}`;
    invoke("log_from_js", { msg }).catch(() => {});
  };

  console.log("[MEDIA UI] Frontend log redirection initialized");
}

start();
