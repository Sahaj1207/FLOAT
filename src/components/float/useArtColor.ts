import { useEffect, useState } from "react";

const SAMPLE_SIZE = 24;
const HUE_BUCKETS = 12;
// Below this, the art is too gray to give a meaningful accent.
const MIN_SCORE = 6;

// Keyed by art data URL; bounded like the art cache in useAlbumArt.
const cache = new Map<string, string | null>();
const MAX_CACHED = 16;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * Pick the art's dominant vibrant hue: bucket pixels by hue, weight each by
 * saturation and mid-lightness, then normalize the winner so it reads well
 * on dark glass.
 */
function extractAccent(img: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ score: 0, x: 0, y: 0, s: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const weight = s * (1 - Math.abs(l - 0.5) * 2);
    if (weight <= 0.05) continue;
    const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS];
    const rad = (h * Math.PI) / 180;
    bucket.score += weight;
    bucket.x += Math.cos(rad) * weight;
    bucket.y += Math.sin(rad) * weight;
    bucket.s += s * weight;
  }

  const best = buckets.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score < MIN_SCORE) return null;
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  const saturation = Math.min(0.85, Math.max(0.5, best.s / best.score));
  return `hsl(${hue.toFixed(0)} ${(saturation * 100).toFixed(0)}% 64%)`;
}

/** Accent color derived from album art (a data URL), or null for none / gray art. */
export function useArtColor(artUrl: string | null): string | null {
  const [color, setColor] = useState<string | null>(() => (artUrl ? cache.get(artUrl) ?? null : null));

  useEffect(() => {
    if (!artUrl) {
      setColor(null);
      return;
    }
    if (cache.has(artUrl)) {
      setColor(cache.get(artUrl) ?? null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const accent = extractAccent(img);
      if (cache.size >= MAX_CACHED) {
        cache.delete(cache.keys().next().value!);
      }
      cache.set(artUrl, accent);
      if (!cancelled) setColor(accent);
    };
    img.src = artUrl;
    return () => {
      cancelled = true;
    };
  }, [artUrl]);

  return color;
}
