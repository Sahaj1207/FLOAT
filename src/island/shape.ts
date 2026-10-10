/**
 * The island's outline as one SVG path.
 *
 * Corners are Apple-style "continuous" corners: a circular arc whose entry
 * and exit are eased by short Bézier segments, rather than a plain arc or a
 * superellipse. This is the construction Figma calls corner smoothing; iOS
 * uses roughly 60%.
 *
 * Docked, the top is flush with the screen edge and joins it through two
 * small concave "ears", like the MacBook notch. Floating, all four corners
 * are convex.
 */

export interface IslandShape {
  width: number;
  height: number;
  /** Top corner radius when floating (0 when docked). */
  topRadius: number;
  bottomRadius: number;
  /** Size of the concave ears joining a docked notch to the edge (0 = none). */
  ear: number;
  /** 0 = plain circular corners (capsules), 0.6 = iOS-like. */
  smoothing: number;
}

interface Corner {
  a: number;
  b: number;
  c: number;
  d: number;
  /** How far along each edge the corner extends. */
  p: number;
  /** Chord of the circular part, per axis. */
  s: number;
  r: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const n = (v: number) => +v.toFixed(3);

/** Corner construction for radius `r`, fitting within `budget` along each edge. */
function corner(r: number, smoothing: number, budget: number): Corner {
  r = Math.max(0, Math.min(r, budget));
  if (r === 0) return { a: 0, b: 0, c: 0, d: 0, p: 0, s: 0, r: 0 };
  // Not enough room for full smoothing: use what fits.
  smoothing = Math.max(0, Math.min(smoothing, budget / r - 1));
  const p = (1 + smoothing) * r;
  const arcMeasure = 90 * (1 - smoothing);
  const s = Math.sin(rad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3ToP4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * smoothing;
  const c = p3ToP4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - s - c - d) / 3;
  return { a: 2 * b, b, c, d, p, s, r };
}

/** Concave quarter joining a vertical side to the top edge. */
const EAR_K = 0.42;

export function islandPath(shape: IslandShape): string {
  const { width: w, height: h, smoothing } = shape;
  const half = Math.min(w, h) / 2;
  const br = corner(shape.bottomRadius, smoothing, half);
  const docked = shape.ear > 0.05 && shape.topRadius < shape.ear;
  const out: string[] = [];

  const bottomRight = (k: Corner) =>
    k.r === 0
      ? ""
      : `c0 ${n(k.a)} 0 ${n(k.a + k.b)} ${n(-k.d)} ${n(k.a + k.b + k.c)}` +
        `a${n(k.r)} ${n(k.r)} 0 0 1 ${n(-k.s)} ${n(k.s)}` +
        `c${n(-k.c)} ${n(k.d)} ${n(-(k.b + k.c))} ${n(k.d)} ${n(-(k.a + k.b + k.c))} ${n(k.d)}`;
  const bottomLeft = (k: Corner) =>
    k.r === 0
      ? ""
      : `c${n(-k.a)} 0 ${n(-(k.a + k.b))} 0 ${n(-(k.a + k.b + k.c))} ${n(-k.d)}` +
        `a${n(k.r)} ${n(k.r)} 0 0 1 ${n(-k.s)} ${n(-k.s)}` +
        `c${n(-k.d)} ${n(-k.c)} ${n(-k.d)} ${n(-(k.b + k.c))} ${n(-k.d)} ${n(-(k.a + k.b + k.c))}`;

  if (docked) {
    // Clockwise from the tip of the left ear, along the (off-screen) top edge.
    const e = Math.min(shape.ear, h / 2);
    const k = e * EAR_K;
    out.push(`M${n(-e)} 0L${n(w + e)} 0`);
    out.push(`C${n(w + k)} 0 ${n(w)} ${n(k)} ${n(w)} ${n(e)}`);
    out.push(`L${n(w)} ${n(h - br.p)}`, bottomRight(br));
    out.push(`L${n(br.p)} ${n(h)}`, bottomLeft(br));
    out.push(`L0 ${n(e)}`);
    out.push(`C0 ${n(k)} ${n(-k)} 0 ${n(-e)} 0Z`);
  } else {
    const tr = corner(shape.topRadius, smoothing, half);
    out.push(`M${n(w - tr.p)} 0`);
    if (tr.r > 0) {
      out.push(
        `c${n(tr.a)} 0 ${n(tr.a + tr.b)} 0 ${n(tr.a + tr.b + tr.c)} ${n(tr.d)}` +
          `a${n(tr.r)} ${n(tr.r)} 0 0 1 ${n(tr.s)} ${n(tr.s)}` +
          `c${n(tr.d)} ${n(tr.c)} ${n(tr.d)} ${n(tr.b + tr.c)} ${n(tr.d)} ${n(tr.a + tr.b + tr.c)}`
      );
    }
    out.push(`L${n(w)} ${n(h - br.p)}`, bottomRight(br));
    out.push(`L${n(br.p)} ${n(h)}`, bottomLeft(br));
    out.push(`L0 ${n(tr.p)}`);
    if (tr.r > 0) {
      out.push(
        `c0 ${n(-tr.a)} 0 ${n(-(tr.a + tr.b))} ${n(tr.d)} ${n(-(tr.a + tr.b + tr.c))}` +
          `a${n(tr.r)} ${n(tr.r)} 0 0 1 ${n(tr.s)} ${n(-tr.s)}` +
          `c${n(tr.c)} ${n(-tr.d)} ${n(tr.b + tr.c)} ${n(-tr.d)} ${n(tr.a + tr.b + tr.c)} ${n(-tr.d)}`
      );
    }
    out.push("Z");
  }
  return out.join("");
}
