import { contrastRatio } from './contrast';
import { LRU } from './lru';
import { formatColor, parseColor } from './parse';
import { type OKLCH, type RGBA, oklchToRgb, rgbToOklch } from './spaces';
import { type Theme, themeKey } from './theme';

/**
 * What a colour is used for. Each role has its own lightness curve, so text stays
 * readable and backgrounds stay dark while hue (brand identity) is preserved.
 */
export type ColorRole = 'background' | 'text' | 'border' | 'shadow';

const memo = new LRU<string, RGBA>(20_000);

function adjust(l: number, theme: Theme): number {
  const mid = 0.55;
  const contrasted = mid + (l - mid) * theme.contrast;
  return Math.min(1, Math.max(0, contrasted * theme.brightness));
}

function mapBackground(c: OKLCH, t: Theme): OKLCH {
  // Light backgrounds invert into a narrow dark band (lighter in, darker out, so
  // nested panels keep their separation). Already-dark backgrounds scale down.
  const top = t.bgL + 0.15;
  const l = c.l > 0.5 ? t.bgL + (1 - c.l) * 0.3 : (c.l / 0.5) * top;
  return { l: adjust(l, t), c: c.c * t.chroma * 0.85, h: c.h, a: c.a };
}

function mapText(c: OKLCH, t: Theme): OKLCH {
  // Dark text becomes light; text that is already light (white on a coloured button)
  // keeps its lightness but is capped just above body text to limit halation.
  const floor = t.fgL - 0.15;
  const l = c.l < 0.5 ? t.fgL - c.l * 0.3 : Math.min(t.fgL + 0.06, Math.max(floor, c.l));
  // Very saturated text colours get a little lighter so they stay legible on dark.
  const boost = Math.min(0.08, c.c * 0.3);
  return { l: adjust(Math.min(0.97, l + boost), t), c: c.c * t.chroma, h: c.h, a: c.a };
}

function mapBorder(c: OKLCH, t: Theme): OKLCH {
  const l = t.borderL + (1 - c.l) * 0.25;
  return { l: adjust(l, t), c: c.c * t.chroma * 0.8, h: c.h, a: c.a };
}

function mapShadow(c: OKLCH): OKLCH {
  return { l: Math.min(c.l, 0.08), c: c.c * 0.5, h: c.h, a: c.a };
}

/** `#rrggbb` (lower case, alpha dropped). The key format used by colour remapping. */
export function toHex(c: RGBA): string {
  const h = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Pure, memoised colour transform. */
export function modifyColor(color: RGBA, role: ColorRole, theme: Theme): RGBA {
  const key = `${role}|${color.r},${color.g},${color.b},${color.a}|${themeKey(theme)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  if (theme.remap) {
    const target = theme.remap[toHex(color)];
    const parsed = target ? parseColor(target) : null;
    if (parsed) {
      const out = { ...parsed, a: parsed.a * color.a };
      memo.set(key, out);
      return out;
    }
  }
  const lch = rgbToOklch(color);
  let out: OKLCH;
  switch (role) {
    case 'background':
      out = mapBackground(lch, theme);
      break;
    case 'text':
      out = mapText(lch, theme);
      break;
    case 'border':
      out = mapBorder(lch, theme);
      break;
    case 'shadow':
      out = mapShadow(lch);
      break;
  }
  const rgb = oklchToRgb(out);
  memo.set(key, rgb);
  return rgb;
}

/** Transforms a CSS colour string. Returns null when the value is not a resolvable colour. */
export function modifyColorValue(value: string, role: ColorRole, theme: Theme): string | null {
  const parsed = parseColor(value);
  if (!parsed) return null;
  return formatColor(modifyColor(parsed, role, theme));
}

/**
 * Raises (or lowers) text lightness until it reaches `minRatio` against `bg`.
 * Used when a rule sets both colours, so the pair is known.
 */
export function ensureContrast(text: RGBA, bg: RGBA, minRatio = 4.5): RGBA {
  if (contrastRatio(text, bg) >= minRatio) return text;
  const lch = rgbToOklch(text);
  const bgL = rgbToOklch(bg).l;
  const dir = bgL < 0.6 ? 1 : -1;
  let best = text;
  for (let l = lch.l; l >= 0 && l <= 1; l += dir * 0.02) {
    best = oklchToRgb({ ...lch, l });
    if (contrastRatio(best, bg) >= minRatio) return best;
  }
  return best;
}
