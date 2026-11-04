import type { RGBA } from './spaces';
import { toLinear } from './spaces';

/** WCAG 2.x relative luminance. */
export function luminance(c: RGBA): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG 2.x contrast ratio, 1..21. Alpha is ignored; blend first if it matters. */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** APCA-W3 0.0.98G lightness contrast (Lc), signed. Body text wants |Lc| >= 60. */
export function apcaContrast(text: RGBA, bg: RGBA): number {
  const y = (c: RGBA) =>
    0.2126729 * Math.max(0, c.r) ** 2.4 +
    0.7151522 * Math.max(0, c.g) ** 2.4 +
    0.072175 * Math.max(0, c.b) ** 2.4;
  const clampBlack = (v: number) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const yt = clampBlack(y(text));
  const yb = clampBlack(y(bg));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let s: number;
  if (yb > yt) {
    s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

/** Composites `top` over an opaque `bottom`. */
export function blend(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}
