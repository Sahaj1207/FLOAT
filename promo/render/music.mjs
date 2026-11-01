// The film's score, synthesised from scratch (no samples, no licences) and
// written to fit the film's timeline: an atmospheric intro under the
// question, a riser into "Meet FLOAT", a groove for the feature montage, a
// breakdown for the craft section, and a final hit and chime on the end card.
// UI sounds (clicks, typing, pops) land on the picture's events.
//
//   node music.mjs   -> ../out/music.wav (reads ../out/timeline.json)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "out");
const { total, bpm, scenes, events } = JSON.parse(readFileSync(path.join(OUT, "timeline.json"), "utf8"));
const at = (id) => scenes.find((s) => s.id === id).start;

const SR = 48000;
const N = Math.ceil((total + 1) * SR);
const BEAT = 60 / bpm;
const BAR = BEAT * 4;
const main = [new Float32Array(N), new Float32Array(N)];
const verb = new Float32Array(N); // reverb send (mono)
const duckEnv = new Float32Array(N); // kick sidechain

const T_MEET = at("meet");
const T_CRAFT = at("craft");
const T_PRIVATE = at("private");
const T_END = at("end");
const section = (t) =>
  t < T_MEET - BAR ? "intro" : t < T_MEET ? "rise" : t < T_CRAFT ? "groove" : t < T_PRIVATE ? "break" : t < T_END ? "return" : "outro";

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

/** Add a mono signal at time t (s); pan -1..1; send = reverb amount. */
function add(t0, len, fn, { gain = 1, pan = 0, send = 0 } = {}) {
  const start = Math.round(t0 * SR);
  const n = Math.round(len * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    const j = start + i;
    if (j < 0 || j >= N) continue;
    const v = fn(i / SR, i);
    main[0][j] += v * gl;
    main[1][j] += v * gr;
    if (send) verb[j] += v * send * gain;
  }
}

// Harmony: Am9 - Fmaj9 - Cmaj7 - G6, one chord per bar.
const CHORDS = [
  { root: 33, pad: [57, 60, 64, 67, 71] },
  { root: 29, pad: [53, 57, 60, 64, 67] },
  { root: 36, pad: [60, 64, 67, 71, 74] },
  { root: 31, pad: [55, 59, 62, 64, 67] },
];
const chordAt = (t) => CHORDS[Math.floor(t / BAR) % CHORDS.length];

// --- Instruments ---------------------------------------------------------------

function pad(t0, len, notes, cutoff, gain) {
  notes.forEach((m, k) => {
    const f = mtof(m);
    let lp = 0;
    const phases = [Math.random(), Math.random(), Math.random()];
    add(
      t0,
      len + 1.4,
      (t) => {
        const env = Math.min(1, t / 0.9) * (t > len ? Math.exp(-(t - len) * 3) : 1);
        let v = 0;
        [0.996, 1, 1.004].forEach((d, i) => {
          const ph = (phases[i] + f * d * t) % 1;
          v += 2 * ph - 1;
        });
        const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
        lp += a * (v / 3 - lp);
        return lp * env;
      },
      { gain, pan: (k / (notes.length - 1)) * 1.2 - 0.6, send: 0.5 }
    );
  });
}

function pluck(t0, m, gain, pan) {
  const f = mtof(m);
  let lp = 0;
  add(
    t0,
    0.5,
    (t) => {
      const env = Math.exp(-t * 11);
      const ph = (f * t) % 1;
      const v = (ph < 0.5 ? 1 : -1) * 0.6 + (2 * ph - 1) * 0.4;
      const cutoff = 600 + 4200 * Math.exp(-t * 18);
      lp += (1 - Math.exp((-2 * Math.PI * cutoff) / SR)) * (v - lp);
      return lp * env;
    },
    { gain, pan, send: 0.45 }
  );
  // Dotted-eighth echo.
  if (gain > 0.02) setTimeout0(() => pluck(t0 + BEAT * 0.75, m, gain * 0.38, -pan));
}
// Echoes are scheduled after the main pass to keep recursion shallow.
const echoQueue = [];
const setTimeout0 = (fn) => echoQueue.push(fn);

function kick(t0, gain = 1) {
  let ph = 0;
  add(
    t0,
    0.45,
    (t) => {
      const f = 45 + 110 * Math.exp(-t * 28);
      ph += f / SR;
      const click = t < 0.004 ? noise() * (1 - t / 0.004) * 0.5 : 0;
      return (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7.5) + click) * 0.95;
    },
    { gain }
  );
  const s = Math.round(t0 * SR);
  for (let i = 0; i < 0.35 * SR && s + i < N; i++) duckEnv[s + i] = Math.max(duckEnv[s + i], Math.exp(-i / SR / 0.12));
}

function clap(t0, gain = 0.32) {
  let bp = 0;
  let lp2 = 0;
  add(
    t0,
    0.35,
    (t) => {
      const bursts = [0, 0.011, 0.022].reduce((a, d) => a + (t >= d ? Math.exp(-(t - d) * (d === 0.022 ? 14 : 90)) : 0), 0);
      const n = noise();
      lp2 += 0.35 * (n - lp2);
      bp = n - lp2; // crude high-pass for brightness
      return bp * bursts * 0.7;
    },
    { gain, send: 0.6 }
  );
}

function hat(t0, gain, open = false) {
  let prev = 0;
  add(
    t0,
    open ? 0.25 : 0.06,
    (t) => {
      const n = noise();
      const hp = n - prev;
      prev = n;
      return hp * Math.exp(-t * (open ? 14 : 55));
    },
    { gain, pan: 0.25 }
  );
}

function bass(t0, m, len, gain = 0.32) {
  const f = mtof(m);
  let lp = 0;
  const s = Math.round(t0 * SR);
  add(
    t0,
    len,
    (t, i) => {
      const ph = (f * t) % 1;
      const v = 2 * ph - 1 + Math.sin(2 * Math.PI * f * t) * 0.8;
      lp += (1 - Math.exp((-2 * Math.PI * 420) / SR)) * (v - lp);
      const env = Math.min(1, t / 0.005) * Math.exp(-t * 2.2) * (t > len - 0.02 ? (len - t) / 0.02 : 1);
      const duck = 1 - 0.7 * (duckEnv[s + i] || 0);
      return lp * env * duck;
    },
    { gain }
  );
}

// --- Sound effects -------------------------------------------------------------

function riser(tEnd, len) {
  let bp = 0;
  let lp = 0;
  add(
    tEnd - len,
    len,
    (t) => {
      const x = t / len;
      const n = noise();
      const cutoff = 300 + 6000 * x * x;
      lp += (1 - Math.exp((-2 * Math.PI * cutoff) / SR)) * (n - lp);
      bp = lp;
      const tone = Math.sin(2 * Math.PI * (200 + 900 * x * x) * t) * 0.25;
      return (bp * 0.8 + tone) * x * x;
    },
    { gain: 0.35, send: 0.4 }
  );
}

function impact(t0, gain = 0.9) {
  let ph = 0;
  let lp = 0;
  add(
    t0,
    3,
    (t) => {
      const f = 30 + 50 * Math.exp(-t * 3);
      ph += f / SR;
      const sub = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 1.6);
      const n = noise();
      lp += 0.08 * (n - lp);
      const crash = (n - lp) * Math.exp(-t * 2.2) * 0.35;
      return sub + crash;
    },
    { gain, send: 0.5 }
  );
}

function hit(t0) {
  let ph = 0;
  add(
    t0,
    0.5,
    (t) => {
      ph += (70 + 90 * Math.exp(-t * 30)) / SR;
      return Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) + noise() * Math.exp(-t * 60) * 0.4;
    },
    { gain: 0.55, send: 0.4 }
  );
}

const tone = (t0, f, len, decay, gain, send = 0.2) =>
  add(t0, len, (t) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay) * Math.min(1, t / 0.002), { gain, send });

function sfx({ t, kind }) {
  switch (kind) {
    case "riser":
      return riser(t, BAR);
    case "impact":
      return impact(t);
    case "hit":
      return hit(t);
    case "click":
      tone(t, 2400, 0.04, 120, 0.12);
      return add(t, 0.01, (x) => noise() * (1 - x / 0.01), { gain: 0.12 });
    case "tick":
      return tone(t, 3200, 0.03, 160, 0.07);
    case "type":
      return add(t, 0.015, (x) => noise() * Math.exp(-x * 400), { gain: 0.18, pan: 0.3 });
    case "pop": {
      let ph = 0;
      return add(t, 0.12, (x) => ((ph += (420 + 900 * Math.min(1, x / 0.03)) / SR), Math.sin(2 * Math.PI * ph) * Math.exp(-x * 30)), { gain: 0.16, send: 0.3 });
    }
    case "whoosh": {
      let lp = 0;
      return add(t - 0.35, 0.9, (x) => {
        const c = 4000 * Math.exp(-x * 3) + 200;
        const n = noise();
        lp += (1 - Math.exp((-2 * Math.PI * c) / SR)) * (n - lp);
        return lp * Math.sin(Math.PI * Math.min(1, x / 0.9));
      }, { gain: 0.3, send: 0.3 });
    }
    case "boing": {
      let ph = 0;
      return add(t, 0.6, (x) => ((ph += (330 + 60 * Math.sin(x * 40) * Math.exp(-x * 6)) / SR), Math.sin(2 * Math.PI * ph) * Math.exp(-x * 6)), { gain: 0.14, send: 0.3 });
    }
    case "tink":
      [1760, 2637, 3520, 5274].forEach((f, k) => tone(t, f, 2.5, 2.2 + k, 0.11 / (k + 1), 0.7));
      return;
  }
}

// --- Arrangement ---------------------------------------------------------------

const bars = Math.ceil(total / BAR);
for (let b = 0; b < bars; b++) {
  const t0 = b * BAR;
  const sec = section(t0 + 0.01);
  const ch = chordAt(t0);
  const cutoff = { intro: 700, rise: 1100, groove: 2200, break: 1300, return: 1800, outro: 1500 }[sec];
  const padGain = { intro: 0.075, rise: 0.07, groove: 0.035, break: 0.08, return: 0.045, outro: 0.06 }[sec];
  if (sec !== "outro" || t0 < T_END + BAR * 2) pad(t0, BAR, sec === "outro" ? CHORDS[0].pad : ch.pad, cutoff, padGain);

  for (let s = 0; s < 16; s++) {
    const t = t0 + (s * BAR) / 16;
    if (t >= total - 0.5) break;
    const ss = section(t + 0.001);
    const beat = s % 4 === 0;
    const off = s % 4 === 2;
    // Drums.
    if ((ss === "groove" || ss === "return") && beat) kick(t, ss === "return" ? 0.8 : 1);
    if (ss === "groove" && (s === 4 || s === 12)) clap(t);
    if ((ss === "groove" || ss === "return") && (beat || off)) hat(t, off ? 0.09 : 0.05, off && s === 14);
    if (ss === "break" && s % 2 === 0) hat(t, 0.035);
    // Bass: eighths on the root, octave lift on the last eighth.
    if ((ss === "groove" || ss === "return") && s % 2 === 0) bass(t, ch.root + (s === 14 ? 12 : 0), BEAT / 2);
    // Arp: chord tones, sparse in the intro, sixteenths in the groove.
    const arp = ch.pad.concat(ch.pad.map((m) => m + 12));
    const pick = arp[(s * 3 + b) % arp.length] + 12;
    if (ss === "intro" && t > BAR && s % 4 === 0) pluck(t, pick, 0.05, 0.3);
    if (ss === "rise" && s % 2 === 0) pluck(t, pick, 0.055, s % 4 ? -0.3 : 0.3);
    if (ss === "groove" && s % 2 === 0) pluck(t, pick, 0.06, s % 4 ? -0.35 : 0.35);
    if (ss === "break" && s % 4 === 0) pluck(t, pick, 0.05, 0.2);
  }
}
events.forEach(sfx);
for (let i = 0; i < echoQueue.length && i < 20000; i++) echoQueue[i]();

// --- Reverb (Schroeder: parallel combs into series all-passes) ------------------

function reverb(input, offset) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [225, 556].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = input[n];
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x + c.lp * 0.86;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const o = a.buf[a.i];
      const v = y + o * 0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.buf.length;
      y = o - v * 0.5;
    }
    out[n] = y * 0.12;
  }
  return out;
}
const rl = reverb(verb, 0);
const rr = reverb(verb, 23);

// --- Master: sum, gentle fade out, normalise, write WAV --------------------------

const L = main[0];
const R = main[1];
let peak = 0;
const fadeFrom = (total - 2.5) * SR;
for (let n = 0; n < N; n++) {
  L[n] += rl[n];
  R[n] += rr[n];
  const fade = n > fadeFrom ? Math.max(0, 1 - (n - fadeFrom) / (2.5 * SR)) : 1;
  L[n] = Math.tanh(L[n] * 1.1) * fade;
  R[n] = Math.tanh(R[n] * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const scale = 0.89 / (peak || 1);
const data = Buffer.alloc(N * 4);
for (let n = 0; n < N; n++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[n] * scale)) * 32767), n * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[n] * scale)) * 32767), n * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(path.join(OUT, "music.wav"), Buffer.concat([header, data]));
console.log(`music.wav  ${total.toFixed(1)}s  ${bars} bars at ${bpm} BPM`);
