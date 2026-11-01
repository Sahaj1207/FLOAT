import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { textgrabCancel, textgrabImage, textgrabRecognize } from "../../platform";
import "./TextGrab.css";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SIZE = 6;

/**
 * Full-screen overlay over a still of the screen: drag a box over any text
 * and it's read and copied. Esc or right-click cancels.
 */
export const TextGrab: React.FC = () => {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "error">("idle");
  const [error, setError] = useState("");
  const shown = useRef(false);

  useEffect(() => {
    textgrabImage().then((image) => {
      if (!image) {
        textgrabCancel();
        return;
      }
      const [b64, w, h] = image;
      setNatural({ w, h });
      setSrc(`data:image/png;base64,${b64}`);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") textgrabCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Show the window only once the still is painted, so nothing flashes.
  const reveal = () => {
    if (shown.current) return;
    shown.current = true;
    requestAnimationFrame(() => {
      const win = getCurrentWindow();
      win.show().then(() => win.setFocus()).catch(() => {});
    });
  };

  const finish = (r: Rect) => {
    if (r.w < MIN_SIZE || r.h < MIN_SIZE) {
      setRect(null);
      return;
    }
    setStatus("reading");
    // CSS px -> physical px of the captured image.
    const sx = natural.w / window.innerWidth;
    const sy = natural.h / window.innerHeight;
    textgrabRecognize(Math.round(r.x * sx), Math.round(r.y * sy), Math.round(r.w * sx), Math.round(r.h * sy)).catch((e) => {
      setStatus("error");
      setError(String(e));
      setTimeout(() => textgrabCancel(), 2200);
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) {
      textgrabCancel();
      return;
    }
    if (e.button !== 0 || status !== "idle") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setStart({ x: e.clientX, y: e.clientY });
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start) return;
    setRect({
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x),
      h: Math.abs(e.clientY - start.y),
    });
  };

  const onPointerUp = () => {
    if (!start || !rect) return;
    setStart(null);
    finish(rect);
  };

  return (
    <div
      className={`textgrab ${rect ? "selecting" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {src && <img className="textgrab-still" src={src} alt="" draggable={false} onLoad={reveal} />}
      {!rect && <div className="textgrab-dim" />}
      {rect && (
        <div
          className={`textgrab-selection ${status}`}
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        >
          {status === "reading" && <span className="textgrab-scan" />}
        </div>
      )}
      <div className="textgrab-hint">
        {status === "error" ? error : status === "reading" ? "Reading text…" : "Drag over the text you want to copy"}
        {status === "idle" && <kbd>Esc</kbd>}
      </div>
    </div>
  );
};

export default TextGrab;
