import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TextGrab } from "./components/textgrab/TextGrab";
import "@fontsource-variable/inter";
import "./index.css";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, applySettingsToDOM, applySettingsToNative } from "./services/settings";

// The Copy Text overlay is its own window loading this same page.
const isTextGrab = window.location.hash === "#textgrab";

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

// Apply initial user settings to DOM
applySettingsToDOM(loadSettings());
if (!isTextGrab) applySettingsToNative(loadSettings());

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isTextGrab ? <TextGrab /> : <App />}
  </React.StrictMode>
);
