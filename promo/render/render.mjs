// Renders promo/film.html frame by frame with Chrome and pipes the frames to
// FFmpeg, then mixes in the narration and the music bed.
//
//   node render.mjs                -> ../out/float-film.mp4
//   node render.mjs --stills 2,14  -> ../out/still-2.png, ...
//
// Needs the Vite dev server on http://localhost:1421 (npx vite --port 1421).
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "out");
const FPS = 30;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const stills = args.includes("--stills") ? args[args.indexOf("--stills") + 1].split(",").map(Number) : null;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
await page.goto("http://localhost:1421/promo/film.html?render", { waitUntil: "networkidle0" });
await page.evaluate(() => window.__ready);
const timeline = await page.evaluate(() => window.__timeline);
writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));

if (stills) {
  for (const t of stills) {
    await page.evaluate((t) => window.__render(t), t);
    await page.screenshot({ path: path.join(OUT, `still-${t}.png`) });
    console.log("still", t);
  }
  await browser.close();
  process.exit(0);
}

// Frames -> silent video.
const frames = Math.ceil(timeline.total * FPS);
const silent = path.join(OUT, "film-silent.mp4");
const ffmpeg = spawn(
  "ffmpeg",
  ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent],
  { stdio: ["pipe", "ignore", "inherit"] }
);
const started = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__render(t), i / FPS);
  const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
  if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % 150 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await browser.close();
console.log("video done", silent);
