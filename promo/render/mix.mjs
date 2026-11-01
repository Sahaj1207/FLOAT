// Builds the soundtrack and muxes it with the rendered video:
// narration clips at their scene starts, a generated ambient music bed that
// ducks under the voice, and soft whooshes on the big transitions.
//
//   node mix.mjs   -> ../out/float-film.mp4 (needs ../out/film-silent.mp4)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "out");
const VOICE = path.join(HERE, "..", "voice");
const { total, scenes } = JSON.parse(readFileSync(path.join(OUT, "timeline.json"), "utf8"));
const at = (id) => scenes.find((s) => s.id === id).start;

const inputs = [];
const filters = [];

// Narration.
scenes.forEach((s, i) => {
  inputs.push("-i", path.join(VOICE, `${s.id}.mp3`));
  const ms = Math.round(s.start * 1000);
  filters.push(`[${i}:a]aresample=48000,adelay=${ms}|${ms},apad[v${i}]`);
});
filters.push(`${scenes.map((_, i) => `[v${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0:duration=longest,atrim=0:${total.toFixed(2)},volume=1.6[voice]`);

// Music: two soft pads (A minor add9, then a brighter F major 7 from "Meet
// FLOAT"), with slow swells, filtered and given some space.
const D = total.toFixed(2);
const pad = (freqs, gain) =>
  `aevalsrc='${freqs.map((f, k) => `${gain}*sin(2*PI*${f}*t)*(0.75+0.25*sin(2*PI*${0.07 + k * 0.03}*t))`).join("+")}':s=48000:d=${D}`;
const meet = at("meet");
filters.push(`${pad([55, 110, 164.81, 246.94, 329.63], 0.05)},afade=t=in:d=2.5,afade=t=out:st=${meet - 0.5}:d=1.5[padA]`);
filters.push(`${pad([87.31, 130.81, 174.61, 220, 329.63, 392], 0.045)},afade=t=in:st=${meet - 0.6}:d=1.2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[padB]`);
filters.push(`[padA][padB]amix=inputs=2:normalize=0,lowpass=f=1400,aecho=0.8:0.7:120|240:0.3|0.2,volume=0.9[musicRaw]`);

// Whooshes: short filtered noise swells.
const whooshAt = [meet - 0.35, at("craft") - 0.4, at("end") - 0.4];
whooshAt.forEach((t, k) => {
  const ms = Math.round(t * 1000);
  filters.push(`anoisesrc=color=pink:d=0.9:a=0.35:r=48000,bandpass=f=1800:w=1200,afade=t=in:d=0.55,afade=t=out:st=0.55:d=0.35,adelay=${ms}|${ms},apad=whole_dur=${D}[w${k}]`);
});
filters.push(`[musicRaw]${whooshAt.map((_, k) => `[w${k}]`).join("")}amix=inputs=${whooshAt.length + 1}:normalize=0[music]`);

// Duck the music under the voice, then put them together.
filters.push(`[voice]asplit=2[voiceOut][voiceKey]`);
filters.push(`[music][voiceKey]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[ducked]`);
filters.push(`[voiceOut][ducked]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`);

const video = path.join(OUT, "film-silent.mp4");
const out = path.join(OUT, "float-film.mp4");
const args = [
  "-y", "-loglevel", "error",
  ...inputs,
  "-i", video,
  "-filter_complex", filters.join(";"),
  "-map", `${scenes.length}:v`, "-map", "[mix]",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-movflags", "+faststart", "-shortest", out,
];
const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("done", out);
