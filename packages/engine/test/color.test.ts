import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  contrastRatio,
  apcaContrast,
  ensureContrast,
  formatColor,
  modifyColor,
  modifyColorValue,
  parseColor,
  rgbToOklch,
} from '../src/color';

const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

describe('parseColor', () => {
  it.each([
    ['#fff', [1, 1, 1, 1]],
    ['#ff000080', [1, 0, 0, 128 / 255]],
    ['rgb(255 0 0 / 50%)', [1, 0, 0, 0.5]],
    ['rgba(0, 128, 255, 0.25)', [0, 128 / 255, 1, 0.25]],
    ['hsl(120deg 100% 50%)', [0, 1, 0, 1]],
    ['hsl(0.5turn, 100%, 50%)', [0, 1, 1, 1]],
    ['hwb(0 0% 0%)', [1, 0, 0, 1]],
    ['rebeccapurple', [0x66 / 255, 0x33 / 255, 0x99 / 255, 1]],
    ['transparent', [0, 0, 0, 0]],
    ['oklch(1 0 0)', [1, 1, 1, 1]],
    ['oklch(62.8% 0.2577 29.23)', [1, 0, 0, 1]],
    ['oklab(0 0 0)', [0, 0, 0, 1]],
    ['lab(100 0 0)', [1, 1, 1, 1]],
    ['lch(54.29 106.84 40.86)', [1, 0, 0, 1]],
    ['color(srgb 1 0.5 0)', [1, 0.5, 0, 1]],
    ['color(display-p3 1 1 1)', [1, 1, 1, 1]],
    ['color-mix(in srgb, white 50%, black)', [0.39, 0.39, 0.39, 1]],
  ])('%s', (input, [r, g, b, a]) => {
    const c = parseColor(input);
    expect(c).not.toBeNull();
    expect(close(c!.r, r!, 0.02) && close(c!.g, g!, 0.02) && close(c!.b, b!, 0.02)).toBe(true);
    expect(close(c!.a, a!)).toBe(true);
  });

  it.each([
    'currentcolor',
    'inherit',
    'var(--x)',
    'rgb(from red r g b)',
    'url(a.png)',
    '#ggg',
    'nope',
  ])('returns null for %s', (input) => expect(parseColor(input)).toBeNull());
});

describe('modifyColor', () => {
  const white = parseColor('#fff')!;
  const black = parseColor('#000')!;

  it('maps white backgrounds dark and black text light', () => {
    expect(rgbToOklch(modifyColor(white, 'background', DEFAULT_THEME)).l).toBeLessThan(0.25);
    expect(rgbToOklch(modifyColor(black, 'text', DEFAULT_THEME)).l).toBeGreaterThan(0.85);
  });

  it('keeps body text off pure white (halation)', () => {
    const t = modifyColor(black, 'text', DEFAULT_THEME);
    expect(t.r).toBeLessThan(0.95);
  });

  it('preserves hue for brand colours', () => {
    for (const brand of ['#1877f2', '#ff4500', '#00a650', '#e60023']) {
      const c = parseColor(brand)!;
      const before = rgbToOklch(c);
      const after = rgbToOklch(modifyColor(c, 'background', DEFAULT_THEME));
      const dh = Math.abs(((after.h - before.h + 540) % 360) - 180);
      expect(dh).toBeLessThan(8);
      expect(after.c).toBeGreaterThan(0.03);
    }
  });

  it('keeps lightness order of related light backgrounds (reversed, separated)', () => {
    const shades = ['#ffffff', '#f6f8fa', '#eaeef2', '#d0d7de'].map((s) => parseColor(s)!);
    const out = shades.map((s) => rgbToOklch(modifyColor(s, 'background', DEFAULT_THEME)).l);
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThan(out[i - 1]!);
  });

  it('body text meets WCAG AA and APCA Lc 60 on the converted page background', () => {
    const bg = modifyColor(white, 'background', DEFAULT_THEME);
    for (const text of ['#000', '#24292f', '#57606a', '#0969da', '#cf222e']) {
      const t = modifyColor(parseColor(text)!, 'text', DEFAULT_THEME);
      expect(contrastRatio(t, bg)).toBeGreaterThanOrEqual(4.5);
    }
    const body = modifyColor(black, 'text', DEFAULT_THEME);
    expect(Math.abs(apcaContrast(body, bg))).toBeGreaterThanOrEqual(60);
  });

  it('respects alpha', () => {
    const c = modifyColor(parseColor('rgba(0,0,0,.1)')!, 'shadow', DEFAULT_THEME);
    expect(c.a).toBeCloseTo(0.1);
  });

  it('memoises', () => {
    expect(modifyColorValue('#abcdef', 'text', DEFAULT_THEME)).toBe(
      modifyColorValue('#abcdef', 'text', DEFAULT_THEME),
    );
  });

  it('ensureContrast lifts low-contrast text', () => {
    const bg = parseColor('#1d1e20')!;
    const fixed = ensureContrast(parseColor('#444')!, bg);
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    expect(formatColor(fixed)).toMatch(/^rgb/);
  });
});
