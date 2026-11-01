// Builds the soundtrack and muxes it with the rendered video: narration
// clips at their scene starts over the score (music.mjs), which ducks
// gently under the voice, normalised for social video.
//
//   node mix.mjs   -> ../out/float-film.mp4 (needs film-silent.mp4 and music.wav)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "out");
const VOICE = path.join(HERE, "..", "voice");
const { total, scenes } = JSON.parse(readFileSync(path.join(OUT, "timeline.json"), "utf8"));

const inputs = [];
const filters = [];

// Narration.
scenes.forEach((s, i) => {
  inputs.push("-i", path.join(VOICE, `${s.id}.mp3`));
  const ms = Math.round(s.start * 1000);
  filters.push(`[${i}:a]aresample=48000,adelay=${ms}|${ms},apad[v${i}]`);
});
filters.push(`${scenes.map((_, i) => `[v${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0:duration=longest,atrim=0:${total.toFixed(2)},volume=1.6[voice]`);

// Music: the synthesised score (music.mjs), already timed to the film.
inputs.push("-i", path.join(OUT, "music.wav"));
filters.push(`[${scenes.length}:a]aresample=48000,volume=0.55[music]`);

// Duck the music under the voice, then put them together.
filters.push(`[voice]asplit=2[voiceOut][voiceKey]`);
filters.push(`[music][voiceKey]sidechaincompress=threshold=0.04:ratio=4:attack=30:release=400[ducked]`);
filters.push(`[voiceOut][ducked]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`);

const video = path.join(OUT, "film-silent.mp4");
const out = path.join(OUT, "float-film.mp4");
const args = [
  "-y", "-loglevel", "error",
  ...inputs,
  "-i", video,
  "-filter_complex", filters.join(";"),
  "-map", `${scenes.length + 1}:v`, "-map", "[mix]",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-movflags", "+faststart", "-shortest", out,
];
const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("done", out);
