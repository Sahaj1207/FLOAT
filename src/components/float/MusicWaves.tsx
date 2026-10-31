import React, { useEffect, useRef } from "react";
import { useLevelsFeed } from "./AudioBars";
import "./MusicWaves.css";

// Three layers: bass (slow, tall, back), mids, treble (quick, low, front).
// Each takes the average of two of the six bands.
const LAYERS = [
  { bands: [0, 1], speed: 0.55, length: 1.1, base: 0.62, swing: 0.5, alpha: 0.85 },
  { bands: [2, 3], speed: 0.9, length: 1.7, base: 0.7, swing: 0.4, alpha: 0.7 },
  { bands: [4, 5], speed: 1.4, length: 2.6, base: 0.8, swing: 0.28, alpha: 0.6 },
];
const SILENT_FALLBACK_MS = 1200;
// How loud each layer looks follows its bands on a spring.
const STIFFNESS = 90;
const DAMPING = 14;
// Paused or silent: a low, still glow.
const RESTING = 0.12;

/** Resolve the panel's accent colour (album art) to "r, g, b". */
function accentRgb(el: HTMLElement): string {
  const probe = document.createElement("span");
  probe.style.color = "var(--float-accent)";
  probe.style.display = "none";
  el.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
  probe.remove();
  return rgb && rgb.length >= 3 ? rgb.slice(0, 3).join(", ") : "255, 255, 255";
}

/**
 * Glowing waves along the bottom of the panel that move with the music:
 * bass, mids and treble each drive one soft layer, tinted by the album art.
 */
export const MusicWaves: React.FC<{ playing: boolean; accentKey?: string }> = ({ playing, accentKey }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audio = useRef({ levels: [] as number[], lastLive: -Infinity });
  const colorRef = useRef("255, 255, 255");

  useLevelsFeed(playing, ({ levels, silent }) => {
    if (silent) return;
    audio.current.levels = levels;
    audio.current.lastLive = performance.now();
  });

  // Re-read the tint when the track (and so the art colour) changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const read = () => (colorRef.current = accentRgb(canvas));
    read();
    // The art colour arrives a moment after the track changes.
    const later = setTimeout(read, 600);
    return () => clearTimeout(later);
  }, [accentKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const energy = LAYERS.map(() => RESTING);
    const velocity = LAYERS.map(() => 0);
    const phase = LAYERS.map((_, i) => i * 1.7);
    let frame = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Match the canvas to its box at device resolution.
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const { levels, lastLive } = audio.current;
      const live = playing && now - lastLive < SILENT_FALLBACK_MS && levels.length >= 6;
      let moving = false;
      const rgb = colorRef.current;

      LAYERS.forEach((layer, i) => {
        // Without live audio (muted), breathe gently instead of freezing.
        const idle = 0.38 + 0.14 * Math.sin(now / 900 + i * 2.1);
        const target = live ? Math.max(RESTING, (levels[layer.bands[0]] + levels[layer.bands[1]]) / 2) : playing ? idle : RESTING;
        velocity[i] += ((target - energy[i]) * STIFFNESS - velocity[i] * DAMPING) * dt;
        energy[i] += velocity[i] * dt;
        if (Math.abs(target - energy[i]) > 0.003 || Math.abs(velocity[i]) > 0.01) moving = true;
        // Louder music also moves the wave along a little faster.
        if (playing) phase[i] += dt * layer.speed * (0.6 + energy[i]);

        const amp = layer.swing * h * energy[i];
        const baseY = h * layer.base - amp * 0.4;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 6) {
          const t = (x / w) * Math.PI * 2 * layer.length;
          const y = baseY - amp * (0.65 * Math.sin(t + phase[i]) + 0.35 * Math.sin(t * 2.3 - phase[i] * 1.4));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();

        const top = baseY - amp;
        const gradient = ctx.createLinearGradient(0, top, 0, h);
        gradient.addColorStop(0, `rgba(${rgb}, ${layer.alpha * (0.55 + energy[i] * 0.45)})`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Keep animating while playing; once paused, stop when the glow settles.
      if (playing || moving) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return <canvas ref={canvasRef} className={`music-waves ${playing ? "playing" : ""}`} aria-hidden="true" />;
};

export default MusicWaves;
