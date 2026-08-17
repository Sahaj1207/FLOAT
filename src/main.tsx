import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { invoke } from "@tauri-apps/api/core";

// Redirect frontend logs to Rust stdout for easy debugging
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
