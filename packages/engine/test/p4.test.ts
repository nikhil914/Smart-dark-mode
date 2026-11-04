import { describe, expect, it } from 'vitest';
import {
  type ColorRole,
  modifyColor,
  modifyColorValue,
  parseColor,
  rgbToOklch,
  rewriteRules,
  themeFrom,
  themeKey,
  VarRegistry,
  contrastRatio,
} from '../src';

const adjust = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, dim: 0 };
const L = (css: string, role: ColorRole, theme: ReturnType<typeof themeFrom>) =>
  rgbToOklch(modifyColor(parseColor(css)!, role, theme));

describe('built-in themes', () => {
  it('AMOLED turns white pages pure black', () => {
    expect(modifyColorValue('#fff', 'background', themeFrom(adjust, { theme: 'amoled' }))).toBe(
      'rgb(0, 0, 0)',
    );
  });

  it('dim is lighter than dark, and high contrast is darker with brighter text', () => {
    const dark = themeFrom(adjust);
    expect(L('#fff', 'background', themeFrom(adjust, { theme: 'dim' })).l).toBeGreaterThan(
      L('#fff', 'background', dark).l,
    );
    const hc = themeFrom(adjust, { theme: 'contrast' });
    expect(L('#fff', 'background', hc).l).toBeLessThan(L('#fff', 'background', dark).l);
    expect(L('#000', 'text', hc).l).toBeGreaterThan(L('#000', 'text', dark).l);
  });

  it('high contrast enforces 7:1 where text and background are known', () => {
    const theme = themeFrom(adjust, { theme: 'contrast' });
    const css = rewriteRules(
      [
        {
          cssText: '',
          selectorText: '.a',
          style: {
            length: 2,
            0: 'color',
            1: 'background-color',
            getPropertyValue: (p: string) => (p === 'color' ? '#777' : '#888'),
            getPropertyPriority: () => '',
          } as never,
        },
      ],
      { theme, vars: new VarRegistry() },
    );
    const fg = /color: (rgb\([^)]+\))/.exec(
      css.replace(/background-color: rgb\([^)]+\);/, ''),
    )![1]!;
    const bg = /background-color: (rgb\([^)]+\))/.exec(css)![1]!;
    expect(contrastRatio(parseColor(fg)!, parseColor(bg)!)).toBeGreaterThanOrEqual(7);
  });

  it('grayscale removes chroma; sepia tints greys warm', () => {
    expect(L('#3366ff', 'text', themeFrom(adjust, { theme: 'grayscale' })).c).toBeLessThan(0.001);
    const sepia = L('#fff', 'background', themeFrom(adjust, { theme: 'sepia' }));
    expect(sepia.c).toBeGreaterThan(0.02);
    expect(sepia.h).toBeGreaterThan(50);
    expect(sepia.h).toBeLessThan(90);
  });

  it('colour-blind themes pull red and green apart', () => {
    const plain = themeFrom(adjust);
    const deutan = themeFrom(adjust, { theme: 'deutan' });
    const gap = (t: typeof plain) =>
      Math.abs(L('#2e7d32', 'text', t).h - L('#c62828', 'text', t).h);
    expect(gap(deutan)).toBeGreaterThan(gap(plain));
    const tritan = themeFrom(adjust, { theme: 'tritan' });
    expect(L('#1565c0', 'text', tritan).h).toBeGreaterThan(L('#1565c0', 'text', plain).h);
  });

  it('custom themes take their lightness and tint from the chosen colours', () => {
    const custom = {
      background: '#102030',
      text: '#e0f0ff',
      link: '#88ccff',
      visited: '#cc88ff',
      border: '#304050',
      selection: '#204060',
      button: '#203040',
      scrollbar: '#405060',
    };
    const theme = themeFrom(adjust, { theme: 'custom:x', custom });
    const page = L('#ffffff', 'background', theme);
    expect(Math.abs(page.l - rgbToOklch(parseColor('#102030')!).l)).toBeLessThan(0.02);
    expect(Math.abs(page.h - rgbToOklch(parseColor('#102030')!).h)).toBeLessThan(5);
    expect(themeKey(theme)).not.toBe(themeKey(themeFrom(adjust)));
  });
});
