import { NAMED_COLORS, SYSTEM_COLORS } from './named';
import {
  type RGBA,
  labToLinearSrgb,
  linearP3ToLinearSrgb,
  linearToRgba,
  oklabToLinearSrgb,
  oklchToRgb,
  rgbToOklch,
  toLinear,
} from './spaces';
import { LRU } from './lru';

const cache = new LRU<string, RGBA | null>(10_000);

function hexToRgba(int: number, a = 1): RGBA {
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255, a };
}

function parseHex(hex: string): RGBA | null {
  const h = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const expand = (s: string) => (s.length <= 4 ? [...s].map((c) => c + c).join('') : s);
  const full = expand(h);
  if (full.length !== 6 && full.length !== 8) return null;
  const n = parseInt(full.slice(0, 6), 16);
  const a = full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1;
  return hexToRgba(n, a);
}

/** Splits function arguments on whitespace, commas and the alpha slash. */
function splitArgs(body: string): { parts: string[]; alpha: string | undefined } {
  const [main = '', alpha] = body.split('/');
  const parts = main.split(/[\s,]+/).filter(Boolean);
  if (alpha === undefined && parts.length === 4)
    return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha: alpha?.trim() };
}

function splitColorArgs(body: string): { parts: string[]; alpha: string | undefined } {
  const [main = '', alpha] = body.split('/');
  return { parts: main.split(/[\s,]+/).filter(Boolean), alpha: alpha?.trim() };
}

/** Number with an optional unit. `pctScale` is what 100% maps to. */
function num(token: string | undefined, pctScale = 1): number | null {
  if (token === undefined) return null;
  if (token === 'none') return 0;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i.exec(token);
  if (!m) return null;
  const v = Number(m[1]);
  switch (m[2]?.toLowerCase()) {
    case '%':
      return (v / 100) * pctScale;
    case 'rad':
      return (v * 180) / Math.PI;
    case 'grad':
      return v * 0.9;
    case 'turn':
      return v * 360;
    default:
      return v;
  }
}

function alphaOf(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const a = num(token, 1);
  return a === null ? null : Math.min(1, Math.max(0, a));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const x = s * Math.min(l, 1 - l);
    return l - x * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function parseFunction(name: string, body: string): RGBA | null {
  if (/\bfrom\b|var\(|calc\(|env\(/i.test(body)) return null;
  const { parts, alpha } = name === 'color' ? splitColorArgs(body) : splitArgs(body);
  const a = alphaOf(alpha);
  if (a === null) return null;
  const [p0, p1, p2] = parts;
  switch (name) {
    case 'rgb':
    case 'rgba': {
      const ch = [p0, p1, p2].map((p) => num(p, 255));
      if (ch.some((x) => x === null)) return null;
      const [r, g, b] = ch as number[];
      return { r: clamp01(r! / 255), g: clamp01(g! / 255), b: clamp01(b! / 255), a };
    }
    case 'hsl':
    case 'hsla': {
      const h = num(p0);
      const s = num(p1, 100);
      const l = num(p2, 100);
      if (h === null || s === null || l === null) return null;
      const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, clamp01(s / 100), clamp01(l / 100));
      return { r, g, b, a };
    }
    case 'hwb': {
      const h = num(p0);
      let w = num(p1, 100);
      let bl = num(p2, 100);
      if (h === null || w === null || bl === null) return null;
      w /= 100;
      bl /= 100;
      if (w + bl >= 1) {
        const gray = w / (w + bl);
        return { r: gray, g: gray, b: gray, a };
      }
      const rgb = hslToRgb(((h % 360) + 360) % 360, 1, 0.5).map((c) => c * (1 - w! - bl!) + w!);
      return { r: rgb[0]!, g: rgb[1]!, b: rgb[2]!, a };
    }
    case 'oklab': {
      const L = num(p0, 1);
      const A = num(p1, 0.4);
      const B = num(p2, 0.4);
      if (L === null || A === null || B === null) return null;
      return linearToRgba(oklabToLinearSrgb([L, A, B]), a);
    }
    case 'oklch': {
      const L = num(p0, 1);
      const C = num(p1, 0.4);
      const H = num(p2);
      if (L === null || C === null || H === null) return null;
      return oklchToRgb({ l: L, c: C, h: H, a });
    }
    case 'lab': {
      const L = num(p0, 100);
      const A = num(p1, 125);
      const B = num(p2, 125);
      if (L === null || A === null || B === null) return null;
      return linearToRgba(labToLinearSrgb(L, A, B), a);
    }
    case 'lch': {
      const L = num(p0, 100);
      const C = num(p1, 150);
      const H = num(p2);
      if (L === null || C === null || H === null) return null;
      const hr = (H * Math.PI) / 180;
      return linearToRgba(labToLinearSrgb(L, C * Math.cos(hr), C * Math.sin(hr)), a);
    }
    case 'color': {
      const space = p0?.toLowerCase();
      const ch = parts.slice(1, 4).map((p) => num(p, 1));
      if (ch.length !== 3 || ch.some((x) => x === null)) return null;
      const [r, g, b] = ch as [number, number, number];
      if (space === 'srgb') return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a };
      if (space === 'srgb-linear') return linearToRgba([r, g, b], a);
      if (space === 'display-p3') {
        return linearToRgba(linearP3ToLinearSrgb([toLinear(r), toLinear(g), toLinear(b)]), a);
      }
      return null;
    }
    default:
      return null;
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** `color-mix(in <space>, c1 [p1], c2 [p2])`, mixed in OKLab whatever the declared space. */
function parseColorMix(body: string): RGBA | null {
  const args = splitTopLevel(body, ',');
  if (args.length !== 3 || !/^\s*in\s/i.test(args[0] ?? '')) return null;
  const parsePart = (s: string): [RGBA | null, number | null] => {
    const m = /\s(\d*\.?\d+)%\s*$/.exec(s);
    const color = parseColor(m ? s.slice(0, m.index) : s);
    return [color, m ? Number(m[1]) / 100 : null];
  };
  const [c1, p1] = parsePart(args[1]!.trim());
  const [c2, p2] = parsePart(args[2]!.trim());
  if (!c1 || !c2) return null;
  const w1 = p1 ?? (p2 !== null ? 1 - p2 : 0.5);
  const w2 = p2 ?? 1 - w1;
  const sum = w1 + w2;
  if (sum <= 0) return null;
  const t = w2 / sum;
  const a = rgbToOklch(c1);
  const b = rgbToOklch(c2);
  const toLab = (c: typeof a) => [
    c.l,
    c.c * Math.cos((c.h * Math.PI) / 180),
    c.c * Math.sin((c.h * Math.PI) / 180),
  ];
  const la = toLab(a);
  const lb = toLab(b);
  const mixed = la.map((v, i) => v! * (1 - t) + lb[i]! * t) as [number, number, number];
  const alpha = (c1.a * (1 - t) + c2.a * t) * Math.min(1, sum);
  return linearToRgba(oklabToLinearSrgb(mixed), alpha);
}

/** Splits on `sep` outside parentheses. */
export function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/**
 * Parses any CSS colour value into sRGB. Returns null for values that need context
 * (`currentcolor`, `inherit`, `var()`, relative colours) or are not colours.
 */
export function parseColor(input: string): RGBA | null {
  const value = input.trim().toLowerCase();
  const hit = cache.get(value);
  if (hit !== undefined) return hit;
  let result: RGBA | null = null;
  if (value.startsWith('#')) result = parseHex(value);
  else if (value === 'transparent') result = { r: 0, g: 0, b: 0, a: 0 };
  else if (value in NAMED_COLORS) result = hexToRgba(NAMED_COLORS[value]!);
  else if (value in SYSTEM_COLORS) result = hexToRgba(SYSTEM_COLORS[value]!);
  else {
    const m = /^([a-z-]+)\((.*)\)$/s.exec(value);
    if (m) {
      result = m[1] === 'color-mix' ? parseColorMix(m[2]!) : parseFunction(m[1]!, m[2]!);
    }
  }
  cache.set(value, result);
  return result;
}

export function formatColor(c: RGBA): string {
  const to255 = (x: number) => Math.round(clamp01(x) * 255);
  const a = Math.round(c.a * 1000) / 1000;
  return a >= 1
    ? `rgb(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)})`
    : `rgba(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)}, ${a})`;
}
