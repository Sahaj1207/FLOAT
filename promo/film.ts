/**
 * FLOAT launch film: a deterministic, frame-by-frame animation.
 *
 * Every visual is a pure function of time `t` (seconds), so `render.mjs`
 * can step through frames and capture them exactly. Opened normally, the
 * page plays in real time for previewing.
 */
import "@fontsource-variable/inter";
import "./film.css";
import { islandPath } from "../src/island/shape";
import timing from "./voice/timing.json";

// ---------------------------------------------------------------------------
// Timeline: scenes follow the narration, with breathing room where the
// visuals need it.

interface Word {
  word: string;
  start: number;
  end: number;
}
interface Scene {
  id: string;
  text: string;
  duration: number;
  words: Word[];
  start: number;
  end: number;
}

const GAP = 0.4;
const HOLD: Record<string, number> = { mac: 0.4, why: 1.0, meet: 1.4, work: 0.6, focus: 0.9, text: 1.0, paste: 1.1, search: 1.2, craft: 0.5, private: 0.4, end: 3.2 };
let cursor = 0.9;
const SCENES: Scene[] = (timing as Omit<Scene, "start" | "end">[]).map((s) => {
  const start = cursor;
  const end = start + s.duration + (HOLD[s.id] ?? 0.3);
  cursor = end + GAP;
  return { ...s, start, end };
});
export const TOTAL = cursor + 0.2;
const S = Object.fromEntries(SCENES.map((s) => [s.id, s])) as Record<string, Scene>;
(window as unknown as { __timeline: unknown }).__timeline = { total: TOTAL, scenes: SCENES.map(({ id, start, end }) => ({ id, start, end })) };

/** Time of word `i` of a scene (absolute seconds). */
const wordAt = (id: string, i: number) => S[id].start + (S[id].words[i]?.start ?? 0);

// ---------------------------------------------------------------------------
// Easing

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** Under-damped spring, 0 -> 1 with a little overshoot, settling ~0.7 s. */
const spring = (sec: number) => (sec <= 0 ? 0 : 1 - Math.exp(-7.5 * sec) * Math.cos(11 * sec));
/** Fade in over [a, a+d], out over [b-d, b]. */
const window01 = (t: number, a: number, b: number, d = 0.35) => Math.min(prog(t, a, a + d), 1 - prog(t, b - d, b));

/** Keyframed values with spring transitions between them. */
type Keys = [number, number[]][];
function morph(keys: Keys, t: number, settle = 1): number[] {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  if (i === 0 && t < keys[0][0]) return keys[0][1];
  const [kt, to] = keys[i];
  const from = i > 0 ? keys[i - 1][1] : to;
  const x = spring((t - kt) / settle);
  return to.map((v, j) => lerp(from[j], v, x));
}
/** Same, eased (no overshoot) - for the camera. */
function glide(keys: Keys, t: number, dur = 1.1): number[] {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  if (i === 0 && t < keys[0][0]) return keys[0][1];
  const [kt, to] = keys[i];
  const from = i > 0 ? keys[i - 1][1] : to;
  const x = easeInOut((t - kt) / dur);
  return to.map((v, j) => lerp(from[j], v, x));
}

// ---------------------------------------------------------------------------
// Scene graph

const stage = document.getElementById("stage")!;
stage.innerHTML = `
  <div id="mac" class="layer">
    <svg id="macSvg" width="1080" height="1080"></svg>
    <div id="macBars" style="position:absolute;display:flex;gap:3px;align-items:center;height:18px"></div>
  </div>
  <div id="world">
    <div id="bezel" style="position:absolute;left:40px;top:170px;width:1000px;height:640px;border-radius:34px;background:linear-gradient(180deg,#26262b,#111114);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 60px 160px rgba(60,80,255,.18)"></div>
    <div id="screen">
      <div id="wall"></div>
      <div id="wallDark"></div>
      <div id="photoWin" class="win" style="left:70px;top:150px;width:390px;height:270px">
        <div class="win-bar">Photos · whiteboard.jpg</div>
        <div id="photo" style="position:absolute;left:0;right:0;top:28px;bottom:0;background:#e9e6df">
          <div style="position:absolute;left:34px;top:34px;font:700 28px/1.2 'Inter Variable';color:#1d4fd7;transform:rotate(-3deg);letter-spacing:-0.02em">Launch FLOAT 2.3<br/>on Friday!</div>
          <div style="position:absolute;left:40px;top:142px;font:600 17px/1.4 'Inter Variable';color:#c0392b;transform:rotate(-2deg)">✓ paste picker<br/>✓ mic mute</div>
          <div style="position:absolute;right:26px;top:120px;width:96px;height:86px;background:#ffe066;transform:rotate(5deg);box-shadow:0 6px 14px rgba(0,0,0,.18);font:600 13px/1.3 'Inter Variable';color:#5b4a00;padding:10px;box-sizing:border-box">Demo video →</div>
        </div>
      </div>
      <div id="selection" style="position:absolute;border-radius:6px;box-shadow:0 0 0 1.5px #fff,0 0 0 2000px rgba(0,0,0,.35)"></div>
      <div id="docWin" class="win" style="left:500px;top:120px;width:390px;height:300px">
        <div class="win-bar">Notes · Reply to Alex</div>
        <div style="padding:16px 18px;font:400 14px/1.6 'Inter Variable';color:#2c2c2e">
          Hi Alex,<br/>Thanks for testing FLOAT! Send any feedback to<br/>
          <span id="pasted" style="font-weight:600;color:#0a63d6"></span><span id="docCaret" class="caret" style="background:#1c1c1e"></span>
        </div>
      </div>
      <div id="taskbar">
        <i style="background:linear-gradient(135deg,#4fa3ff,#2b6fff)"></i>
        <i style="background:linear-gradient(135deg,#ffd84d,#ff9f0a)"></i>
        <i style="background:linear-gradient(135deg,#34c759,#1a9d43)"></i>
        <i style="background:linear-gradient(135deg,#ff6b9a,#ff375f)"></i>
        <i style="background:linear-gradient(135deg,#bf5af2,#7a3cff)"></i>
        <i style="background:linear-gradient(135deg,#8e8e93,#48484a)"></i>
      </div>
      <div id="islandWrap"><div id="island">
        <svg id="islandSvg"><defs>
          <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient>
        </defs><path id="islandFill" fill="#000"/><path id="islandRim" fill="none" stroke="url(#rim)" stroke-width="1" opacity="0"/></svg>
        <div id="islandClip">
          <div id="iMedia" class="isl"><span class="art"></span><span>Midnight Drive</span><span class="bars" id="mediaBars"></span></div>
          <div id="iFocus" class="isl"><svg class="ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2.5"/><circle id="ringArc" cx="10" cy="10" r="8.5" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" transform="rotate(-90 10 10)" stroke-dasharray="53.4"/></svg><span>Write the report</span><span id="focusTime" style="margin-left:auto;color:#a78bfa;font-variant-numeric:tabular-nums">24:12</span></div>
          <div id="iHeld" class="isl"><span style="color:#a78bfa">●</span><span>3 notifications held</span><span style="margin-left:auto;color:rgba(235,235,245,.6);font-weight:500">until you're done</span></div>
          <div id="iMeet" class="isl"><span style="color:#ff453a">◷</span><span>Standup</span><span style="margin-left:auto;color:#ff453a;font-variant-numeric:tabular-nums">in 4 min</span><span class="chip" style="background:#30d158;color:#fff">Join</span></div>
          <div id="iCopied" class="isl"><span style="color:#0a84ff">⎘</span><span>Copied text</span><span style="margin-left:auto;color:rgba(235,235,245,.6);font-weight:500">Launch FLOAT 2.3 on Friday!</span></div>
          <div id="iPanel" class="panel">
            <div class="tabs"><i></i><i></i><i></i><i></i><span style="flex:1"></span><i></i><i></i><i></i></div>
            <div style="display:flex;gap:18px;margin-top:22px;align-items:center">
              <div style="width:96px;height:96px;border-radius:16px;background:linear-gradient(135deg,#ff6b9a,#7a5cff 60%,#23d5ff)"></div>
              <div><div style="font-size:20px;font-weight:600">Midnight Drive</div><div style="font-size:14px;color:rgba(235,235,245,.6);margin-top:4px">Neon Avenue</div>
              <div style="margin-top:14px;width:300px;height:4px;border-radius:2px;background:rgba(255,255,255,.14)"><div id="panelProgress" style="height:100%;border-radius:2px;background:#ff7ab8;width:30%"></div></div></div>
            </div>
            <div style="position:absolute;left:20px;bottom:14px;font-size:12px;color:rgba(235,235,245,.6)"><b style="color:#fff">9:41</b> · ☀ 24° · Next: Standup in 1 h</div>
          </div>
          <div id="iSearch" class="panel" style="padding-top:44px">
            <div class="field"><span style="opacity:.6">⌕</span><span id="searchText"></span><span class="caret"></span></div>
            <div class="row" id="rowDark" style="background:rgba(255,255,255,.1)"><span class="tile" style="background:#48484a">☾</span><div><b>Dark mode</b><small>Switch Windows to dark</small></div></div>
            <div class="row"><span class="tile" style="background:#0a84ff">◐</span><div><b>Display</b><small>Settings</small></div></div>
          </div>
          <div id="iPaste" class="panel" style="padding-top:44px">
            <div class="field"><span style="opacity:.6">⎘</span><span style="color:rgba(235,235,245,.3)">Paste from clipboard history or a pinned snippet</span></div>
            <div style="font-size:11px;font-weight:600;color:rgba(235,235,245,.3);padding:2px 10px">Pinned</div>
            <div class="row" id="rowPin"><span class="tile" style="background:#ffd60a;color:#1c1c1e">⚲</span><div><b>hello@float.app</b><small>Pinned · 1</small></div></div>
            <div class="row" id="rowClip"><span class="tile" style="background:#5e5ce6">⎘</span><div><b>Launch FLOAT 2.3 on Friday!</b><small>Just now · 2</small></div></div>
          </div>
        </div>
      </div></div>
    </div>
  </div>
  <div id="craft" class="layer">
    <div id="blobs" class="layer"></div>
    <svg id="craftSvg" width="1080" height="1080" style="position:absolute;inset:0"></svg>
    <div id="glassPill" style="position:absolute;left:240px;top:470px;width:600px;height:150px;border-radius:75px;backdrop-filter:blur(30px) saturate(1.8) brightness(.9);background:rgba(16,16,24,.32);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.6),inset 0 0 0 1.5px rgba(255,255,255,.22),0 30px 90px rgba(0,0,0,.45);display:flex;align-items:center;gap:22px;padding:0 40px;box-sizing:border-box">
      <span class="art" style="width:76px;height:76px;border-radius:20px"></span>
      <div><div style="font-size:30px;font-weight:600;letter-spacing:-0.02em">Midnight Drive</div><div style="font-size:20px;color:rgba(255,255,255,.7);margin-top:4px">Neon Avenue</div></div>
      <span class="bars" id="glassBars" style="height:44px;gap:5px"></span>
    </div>
    <div id="craftLabel" style="position:absolute;left:0;right:0;top:250px;text-align:center;font-size:54px;font-weight:700;letter-spacing:-0.04em"></div>
  </div>
  <div id="private" class="layer" style="display:flex;flex-direction:column;justify-content:center;padding-left:150px;gap:38px">
    <div class="pv" style="font-size:54px;font-weight:700;letter-spacing:-0.04em"><span style="color:#30d158">●</span> Everything stays on your PC.</div>
    <div class="pv" style="font-size:54px;font-weight:700;letter-spacing:-0.04em"><span style="color:#0a84ff">●</span> No account. No tracking.</div>
    <div class="pv" style="font-size:54px;font-weight:700;letter-spacing:-0.04em"><span style="color:#ffd60a">●</span> Free and open source.</div>
  </div>
  <div id="end" class="layer" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div id="endPill" style="width:300px;height:64px;border-radius:32px;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 0 80px rgba(167,139,250,.35);display:flex;align-items:center;gap:12px;padding:0 18px;box-sizing:border-box">
      <span class="art" style="width:36px;height:36px;border-radius:10px"></span><span style="font-size:17px;font-weight:600">Midnight Drive</span><span class="bars" id="endBars" style="height:26px"></span>
    </div>
    <div id="endWord" style="margin-top:56px;font-size:150px;font-weight:800;letter-spacing:-0.06em;line-height:1">FLOAT</div>
    <div id="endTag" style="margin-top:22px;font-size:36px;font-weight:500;color:rgba(235,235,245,.75);letter-spacing:-0.02em">The island Windows was missing.</div>
    <div id="endUrl" style="margin-top:60px;font-size:24px;font-weight:600;color:rgba(235,235,245,.55)">github.com/Sahaj1207/FLOAT · link in comments</div>
  </div>
  <div id="big"></div>
  <div id="captions"></div>
  <canvas id="grain" width="270" height="270"></canvas>
  <div id="vignette"></div>
  <div id="fade"></div>
`;

const $ = (id: string) => document.getElementById(id)!;
const set = (el: HTMLElement | SVGElement, styles: Record<string, string | number>) => {
  for (const [k, v] of Object.entries(styles)) (el.style as unknown as Record<string, string>)[k] = String(v);
};

// Equalizer bars and their synthetic "music".
function makeBars(id: string, n: number) {
  const el = $(id);
  el.innerHTML = Array.from({ length: n }, () => "<span></span>").join("");
  return Array.from(el.children) as HTMLElement[];
}
const mediaBars = makeBars("mediaBars", 5);
const endBars = makeBars("endBars", 5);
const macBars = makeBars("macBars", 4);
const glassBars = makeBars("glassBars", 5);
const level = (t: number, i: number) =>
  clamp(0.45 + 0.3 * Math.sin(t * 7.1 + i * 1.7) + 0.22 * Math.sin(t * 13.3 + i * 2.9) + 0.12 * Math.sin(t * 3.1 + i));
function drawBars(bars: HTMLElement[], t: number, height: number, width = 2.5) {
  bars.forEach((b, i) => {
    const env = 1 - 0.32 * Math.pow(Math.abs(i - (bars.length - 1) / 2) / ((bars.length - 1) / 2 || 1), 2);
    b.style.width = `${width}px`;
    b.style.height = `${width + (height - width) * level(t, i) * env}px`;
  });
}

// Film grain: a small noise tile, re-seeded every frame.
const grain = ($("grain") as HTMLCanvasElement).getContext("2d")!;
const grainImg = grain.createImageData(270, 270);
function drawGrain(frame: number) {
  let seed = (frame * 2654435761) >>> 0;
  const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = seed >>> 24;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  grain.putImageData(grainImg, 0, 0);
}

// Craft scene: colourful blobs behind the glass.
$("blobs").innerHTML = [
  ["#ff4fa3", 280, 420, 360],
  ["#4f7bff", 660, 470, 380],
  ["#23d5ff", 470, 700, 320],
  ["#ffb443", 820, 300, 260],
]
  .map(([c, x, y, r]) => `<div class="blob" style="position:absolute;left:${x}px;top:${y}px;width:${r}px;height:${r}px;margin:-${(r as number) / 2}px;border-radius:50%;background:${c};filter:blur(14px);opacity:.95"></div>`)
  .join("");
const blobs = Array.from($("blobs").children) as HTMLElement[];

// Captions: one span per word.
function captionFor(t: number) {
  const scene = SCENES.find((s) => t >= s.start - 0.05 && t < s.end + 0.15);
  const cap = $("captions");
  if (!scene || scene.id === "why" || scene.id === "end" || scene.id === "private" || scene.id === "craft") {
    cap.innerHTML = "";
    return;
  }
  if (cap.dataset.scene !== scene.id) {
    cap.dataset.scene = scene.id;
    const tokens = scene.text.split(/\s+/);
    const labels = tokens.length === scene.words.length ? tokens : scene.words.map((w) => w.word);
    cap.innerHTML = labels.map((w) => `<span>${w} </span>`).join("");
  }
  const out = 1 - prog(t, scene.end - 0.25, scene.end + 0.1);
  Array.from(cap.children).forEach((el, i) => {
    const w = scene.words[i];
    const x = easeOut(prog(t, scene.start + w.start - 0.05, scene.start + w.start + 0.25));
    set(el as HTMLElement, { opacity: x * out, transform: `translateY(${(1 - x) * 14}px)`, filter: `blur(${(1 - x) * 6}px)` });
  });
}

// ---------------------------------------------------------------------------
// The island: size keyframes per scene (w, h, radius) in app pixels.

const ISLAND_SCALE = 0.75;
function islandState(t: number): { w: number; h: number; r: number; show: number } {
  const m = S.meet.start;
  const keys: Keys = [
    [0, [8, 8, 4]],
    [m + 0.15, [8, 8, 4]],
    [m + 0.35, [150, 34, 17]],
    [S.work.start + 0.2, [300, 36, 18]],
    [wordAt("work", 7) - 0.1, [580, 244, 30]],
    [S.work.end - 0.4, [300, 36, 18]],
    [S.focus.start + 0.1, [310, 36, 18]],
    [wordAt("focus", 7) - 0.1, [330, 36, 18]],
    [wordAt("focus", 12), [340, 36, 18]],
    [S.text.start, [150, 34, 17]],
    [wordAt("text", 4) + 0.4, [360, 36, 18]],
    [S.paste.start - 0.1, [580, 210, 30]],
    [S.paste.end - 0.4, [150, 34, 17]],
    [S.search.start - 0.1, [580, 200, 30]],
    [S.search.end - 0.3, [300, 36, 18]],
  ];
  const [w, h, r] = morph(keys, t, 0.85);
  const show = prog(t, m, m + 0.2) * (1 - prog(t, S.craft.start - 0.3, S.craft.start));
  return { w, h, r, show };
}

function render(t: number, frame: number) {
  // --- Mac notch intro -----------------------------------------------------
  const macOn = 1 - prog(t, S.ask.start + 0.2, S.ask.start + 1.1);
  const macIn = easeOut(prog(t, 0.1, 1.6));
  set($("mac"), {
    opacity: macOn * macIn,
    transformOrigin: "540px 318px",
    transform: `translateY(110px) scale(${2.1 - 0.25 * easeOut(prog(t, 0, S.ask.start + 1))})`,
    filter: `blur(${(1 - macOn) * 12}px)`,
  });
  if (macOn > 0) {
    const notchW = 230;
    const notchH = 34;
    const path = islandPath({ width: notchW, height: notchH, topRadius: 0, bottomRadius: 12, ear: 8, smoothing: 0.6 });
    const glow = 0.5 + 0.5 * Math.sin(t * 2.2);
    $("macSvg").innerHTML = `
      <defs><linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2e"/><stop offset="1" stop-color="#121214"/></linearGradient>
      <radialGradient id="screenGlow" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#3b3f8f" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
      <rect x="40" y="300" width="1000" height="640" rx="34" fill="url(#bezel)"/>
      <rect x="58" y="318" width="964" height="604" rx="18" fill="#05060a"/>
      <rect x="58" y="318" width="964" height="604" rx="18" fill="url(#screenGlow)"/>
      <rect x="58" y="318" width="964" height="26" fill="rgba(255,255,255,.06)"/>
      ${[90, 140, 200, 250].map((x) => `<rect x="${x}" y="327" width="${x === 90 ? 14 : 34}" height="8" rx="3" fill="rgba(255,255,255,.55)"/>`).join("")}
      ${[880, 920, 960].map((x) => `<rect x="${x}" y="327" width="22" height="8" rx="3" fill="rgba(255,255,255,.5)"/>`).join("")}
      <g transform="translate(${540 - notchW / 2 - 8}, 318)" style="filter:drop-shadow(0 0 ${10 + 14 * glow}px rgba(167,139,250,${0.35 + 0.3 * glow}))"><path d="${path}" fill="#000"/></g>
      <rect x="${540 - notchW / 2 + 14}" y="${318 + 7}" width="20" height="20" rx="5" fill="url(#bezel)"/>
    `;
    set($("macBars"), { left: `${540 + notchW / 2 - 40}px`, top: `${318 + 8}px` });
    drawBars(macBars, t, 18, 3);
    macBars.forEach((b) => (b.style.background = "#a78bfa"));
  }

  // --- World / camera ------------------------------------------------------
  const worldOn = prog(t, S.ask.start + 0.4, S.ask.start + 1.4) * (1 - prog(t, S.craft.start - 0.2, S.craft.start + 0.4));
  const islandY = 190 + 6;
  const cam = glide(
    [
      [0, [1, 540, 520]],
      [S.why.start, [1, 540, 520]],
      [S.meet.start - 0.2, [2.6, 540, islandY + 100]],
      [S.work.start + 0.4, [1.7, 540, islandY + 170]],
      [S.focus.start, [2.6, 540, islandY + 100]],
      [S.text.start + 0.1, [1.7, 325, 470]],
      [wordAt("text", 4) + 0.2, [1.5, 450, islandY + 200]],
      [S.paste.start + 0.1, [1.6, 640, islandY + 175]],
      [S.search.start, [1.7, 540, islandY + 170]],
      [wordAt("search", 6) + 0.6, [1.08, 540, 500]],
    ],
    t,
    1.0
  );
  set($("world"), {
    opacity: worldOn,
    transform: `translate(540px, 540px) scale(${cam[0]}) translate(${-cam[1]}px, ${-cam[2]}px)`,
    filter: `blur(${S.why.start <= t && t < S.meet.start ? 10 * window01(t, S.why.start, S.meet.start, 0.4) : 0}px)`,
  });

  // Windows appear for their scenes.
  const photo = window01(t, S.text.start - 0.2, S.paste.start + 0.2, 0.4);
  set($("photoWin"), { opacity: photo, transform: `scale(${0.94 + 0.06 * easeOut(photo)})` });
  const doc = window01(t, S.paste.start - 0.3, S.search.start + 0.3, 0.4);
  set($("docWin"), { opacity: doc, transform: `scale(${0.94 + 0.06 * easeOut(doc)})` });

  // Copy Text selection over the whiteboard words.
  const selA = wordAt("text", 1);
  const drag = easeInOut(prog(t, selA, selA + 0.9));
  const selOn = window01(t, selA - 0.1, wordAt("text", 4) + 0.3, 0.2);
  set($("selection"), {
    left: `${70 + 26}px`,
    top: `${150 + 28 + 26}px`,
    width: `${10 + 260 * drag}px`,
    height: `${8 + 80 * drag}px`,
    opacity: selOn,
  });

  // Paste: the pinned email types into the doc after Enter.
  const pasteAt = wordAt("paste", 4) + 0.2;
  ($("pasted") as HTMLElement).textContent = t > pasteAt + 0.5 ? "hello@float.app" : "";
  set($("docCaret"), { opacity: Math.floor(t * 2) % 2 === 0 ? 1 : 0 });
  set($("rowPin"), { background: t > S.paste.start + 0.7 ? "rgba(255,255,255,.1)" : "transparent" });

  // Dark mode flips the desktop.
  const darkAt = wordAt("search", 7);
  const dark = easeInOut(prog(t, darkAt, darkAt + 0.9));
  set($("wallDark"), { opacity: dark });
  set($("taskbar"), { background: `rgba(${lerp(240, 30, dark)},${lerp(240, 30, dark)},${lerp(250, 36, dark)},${lerp(0.55, 0.7, dark)})` });
  const typed = "dark mode".slice(0, Math.floor(prog(t, S.search.start + 0.5, wordAt("search", 6)) * 9));
  ($("searchText") as HTMLElement).textContent = typed;
  set($("rowDark"), { opacity: typed.length >= 4 ? 1 : 0.0 });

  // --- Island --------------------------------------------------------------
  const isl = islandState(t);
  const d = islandPath({ width: isl.w, height: isl.h, topRadius: isl.r, bottomRadius: isl.r, ear: 0, smoothing: isl.h > 60 ? 0.6 : 0 });
  set($("island"), { opacity: isl.show, transform: `translateX(${(-isl.w * ISLAND_SCALE) / 2}px) scale(${ISLAND_SCALE})` });
  ($("islandFill") as unknown as SVGPathElement).setAttribute("d", d);
  ($("islandRim") as unknown as SVGPathElement).setAttribute("d", d);
  set($("islandClip"), { width: `${isl.w}px`, height: `${isl.h}px`, clipPath: `path("${d}")` });

  // Which content is in the island, crossfading with a blur like the app.
  const content: Record<string, [number, number]> = {
    iMedia: [S.work.start + 0.3, wordAt("work", 7) - 0.2],
    iPanel: [wordAt("work", 7), S.work.end - 0.45],
    iFocus: [S.focus.start + 0.15, wordAt("focus", 7) - 0.1],
    iHeld: [wordAt("focus", 7), wordAt("focus", 12) - 0.1],
    iMeet: [wordAt("focus", 12), S.focus.end + 0.2],
    iCopied: [wordAt("text", 4) + 0.45, S.text.end + 0.3],
    iPaste: [S.paste.start + 0.15, S.paste.end - 0.45],
    iSearch: [S.search.start + 0.1, S.search.end - 0.35],
  };
  // Media pill returns between panels.
  const media2: [number, number] = [S.work.end - 0.3, S.focus.start + 0.1];
  for (const [id, [a, b]] of Object.entries(content)) {
    let x = window01(t, a, b, 0.25);
    if (id === "iMedia") x = Math.max(x, window01(t, media2[0], media2[1], 0.2), window01(t, S.search.end - 0.3, S.craft.start, 0.25));
    set($(id), { opacity: x, filter: `blur(${(1 - x) * 8}px)`, transform: `scale(${0.94 + 0.06 * x})` });
  }
  drawBars(mediaBars, t, 16);
  const focusRemaining = 24 * 60 + 12 - Math.max(0, t - S.focus.start) * 7;
  ($("focusTime") as HTMLElement).textContent = `${Math.floor(focusRemaining / 60)}:${String(Math.floor(focusRemaining % 60)).padStart(2, "0")}`;
  $("ringArc").setAttribute("stroke-dashoffset", String(53.4 * (0.35 - 0.08 * prog(t, S.focus.start, S.focus.end))));
  set($("panelProgress"), { width: `${30 + 10 * prog(t, S.work.start, S.work.end)}%` });

  // --- Big kinetic type ------------------------------------------------------
  const big = $("big");
  if (t >= S.why.start - 0.1 && t < S.meet.start + 0.3) {
    const out = 1 - prog(t, S.meet.start - 0.2, S.meet.start + 0.2);
    const words = ["Why", "can't", "Windows?"];
    big.innerHTML = `<div style="font-size:118px;line-height:1.05">${words
      .map((w, i) => {
        const x = easeOut(prog(t, wordAt("why", i) - 0.05, wordAt("why", i) + 0.35));
        const color = i === 2 ? "background:linear-gradient(90deg,#7aa2ff,#c38bff);-webkit-background-clip:text;color:transparent" : "";
        return `<span style="opacity:${x * out};transform:translateY(${(1 - x) * 40}px) scale(${0.96 + 0.04 * x});filter:blur(${(1 - x) * 14}px);${color}">${w}</span>${i === 1 ? "<br/>" : " "}`;
      })
      .join("")}</div>`;
  } else {
    big.innerHTML = "";
  }

  // --- Craft: curves, glass, spring ------------------------------------------
  const craftOn = window01(t, S.craft.start - 0.3, S.craft.end + 0.2, 0.45);
  set($("craft"), { opacity: craftOn });
  if (craftOn > 0) {
    const c0 = S.craft.start;
    const curves = [c0, wordAt("craft", 2) - 0.1];
    const glass = [wordAt("craft", 2) - 0.1, wordAt("craft", 4) - 0.1];
    const motion = [wordAt("craft", 4) - 0.1, S.craft.end + 0.2];
    // Curves: the continuous corner traced next to a plain circular one.
    const draw = easeInOut(prog(t, curves[0] + 0.1, curves[0] + 1.3));
    const curvesOn = window01(t, curves[0], curves[1], 0.3);
    const big1 = islandPath({ width: 640, height: 300, topRadius: 110, bottomRadius: 110, ear: 0, smoothing: 0.6 });
    $("craftSvg").innerHTML = `
      <g transform="translate(220, 420)" opacity="${curvesOn}">
        <rect width="640" height="300" rx="110" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2" stroke-dasharray="6 8"/>
        <path d="${big1}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - draw}"/>
      </g>`;
    const glassOn = Math.max(window01(t, glass[0], glass[1], 0.3), window01(t, motion[0], motion[1], 0.2));
    const bounce = t >= motion[0] ? 1 + 0.12 * Math.sin((t - motion[0]) * 9) * Math.exp(-(t - motion[0]) * 2.4) : 1;
    const squish = t >= motion[0] ? 1 - 0.08 * Math.sin((t - motion[0]) * 9 + 0.6) * Math.exp(-(t - motion[0]) * 2.4) : 1;
    set($("glassPill"), { opacity: glassOn, transform: `scale(${bounce}, ${squish})` });
    drawBars(glassBars, t, 44, 5);
    glassBars.forEach((b) => (b.style.background = "#fff"));
    blobs.forEach((b, i) => set(b, { transform: `translate(${Math.sin(t * 0.7 + i * 1.6) * 60}px, ${Math.cos(t * 0.6 + i * 2.2) * 50}px)` }));
    set($("blobs"), { opacity: Math.max(glassOn, curvesOn * 0.3) });
    const label = t < glass[0] ? "Apple's curves." : t < motion[0] ? "Real glass." : "Spring motion.";
    const labelStart = t < glass[0] ? curves[0] : t < motion[0] ? glass[0] : motion[0];
    const lx = easeOut(prog(t, labelStart, labelStart + 0.4));
    $("craftLabel").textContent = label;
    set($("craftLabel"), { opacity: lx * craftOn, transform: `translateY(${(1 - lx) * 20}px)`, filter: `blur(${(1 - lx) * 10}px)` });
  }

  // --- Private ---------------------------------------------------------------
  const pvOn = window01(t, S.private.start - 0.2, S.private.end + 0.2, 0.4);
  set($("private"), { opacity: pvOn });
  const pvAt = [S.private.start, wordAt("private", 1), wordAt("private", 6)];
  Array.from(document.querySelectorAll<HTMLElement>(".pv")).forEach((el, i) => {
    const x = easeOut(prog(t, pvAt[i] - 0.05, pvAt[i] + 0.45));
    set(el, { opacity: x, transform: `translateX(${(1 - x) * -30}px)`, filter: `blur(${(1 - x) * 10}px)` });
  });

  // --- End card --------------------------------------------------------------
  const e0 = S.end.start;
  const endOn = prog(t, e0 - 0.3, e0 + 0.3);
  set($("end"), { opacity: endOn });
  const pill = spring(t - e0);
  set($("endPill"), { transform: `scale(${0.2 + 0.8 * pill})`, opacity: clamp(pill * 2) });
  drawBars(endBars, t, 26, 3.5);
  const ew = easeOut(prog(t, wordAt("end", 0), wordAt("end", 0) + 0.6));
  set($("endWord"), { opacity: ew, transform: `translateY(${(1 - ew) * 30}px)`, filter: `blur(${(1 - ew) * 16}px)` });
  const et = easeOut(prog(t, wordAt("end", 1), wordAt("end", 1) + 0.6));
  set($("endTag"), { opacity: et, transform: `translateY(${(1 - et) * 16}px)` });
  set($("endUrl"), { opacity: easeOut(prog(t, S.end.end - 2.2, S.end.end - 1.4)) });

  // --- Finish ---------------------------------------------------------------
  captionFor(t);
  drawGrain(frame);
  set($("fade"), { opacity: Math.max(1 - prog(t, 0, 0.6), prog(t, TOTAL - 0.8, TOTAL)) });
}

// ---------------------------------------------------------------------------
// Render hooks

const FPS = 30;
(window as unknown as { __render: (t: number) => void }).__render = (t: number) => render(t, Math.round(t * FPS));
(window as unknown as { __ready: Promise<unknown> }).__ready = document.fonts.ready;

// Preview: play in real time unless driven by the renderer (?render).
if (!location.search.includes("render")) {
  const params = new URLSearchParams(location.search);
  const from = Number(params.get("t") ?? 0);
  const begin = performance.now() - from * 1000;
  const loop = () => {
    const t = ((performance.now() - begin) / 1000) % TOTAL;
    render(t, Math.round(t * FPS));
    requestAnimationFrame(loop);
  };
  if (params.has("still")) render(from, Math.round(from * FPS));
  else requestAnimationFrame(loop);
}
