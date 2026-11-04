import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  type Theme,
  expandTemplates,
  modifyColorValue,
  parseColor,
  rewriteValue,
  themeFrom,
  themeKey,
  toHex,
} from '../src';

const adjust = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, dim: 0 };

describe('colour remapping', () => {
  const theme = themeFrom(adjust, 'balanced', { '#ff0000': '#00ff00' });

  it('maps a picked colour to the chosen one for every role', () => {
    expect(modifyColorValue('#f00', 'background', theme)).toBe('rgb(0, 255, 0)');
    expect(modifyColorValue('red', 'text', theme)).toBe('rgb(0, 255, 0)');
  });

  it('keeps the source alpha', () => {
    expect(modifyColorValue('rgba(255,0,0,0.5)', 'background', theme)).toBe('rgba(0, 255, 0, 0.5)');
  });

  it('leaves other colours to the normal transform', () => {
    const plain = themeFrom(adjust);
    expect(modifyColorValue('#fff', 'background', theme)).toBe(
      modifyColorValue('#fff', 'background', plain),
    );
  });

  it('changes the theme key so memoised results do not leak between remaps', () => {
    const other = themeFrom(adjust, 'balanced', { '#ff0000': '#0000ff' });
    expect(themeKey(theme)).not.toBe(themeKey(other));
    expect(themeKey(themeFrom(adjust))).toBe(themeKey({ ...DEFAULT_THEME, chroma: 0.85 }));
  });

  it('formats hex keys from parsed colours', () => {
    expect(toHex(parseColor('rgb(18, 52, 86)')!)).toBe('#123456');
  });
});

describe('palette hook', () => {
  it('reports every converted colour with its role', () => {
    const seen: string[] = [];
    rewriteValue('1px solid #ddd, red', 'border', {
      theme: DEFAULT_THEME as Theme,
      rewriteVars: false,
      onColor: (c, role) => seen.push(`${role}:${c}`),
    });
    expect(seen).toEqual(['border:#ddd', 'border:red']);
  });
});

describe('expandTemplates', () => {
  const theme = DEFAULT_THEME as Theme;

  it('converts templates using the property role', () => {
    const out = expandTemplates('.a { color: ${#000}; background: ${white} }', theme);
    expect(out).toContain(`color: ${modifyColorValue('#000', 'text', theme)}`);
    expect(out).toContain(`background: ${modifyColorValue('white', 'background', theme)}`);
  });

  it('returns the raw colour when no theme applies (filtered mode)', () => {
    expect(expandTemplates('a { color: ${#123} }', null)).toBe('a { color: #123 }');
  });

  it('leaves CSS without templates and unknown templates alone', () => {
    expect(expandTemplates('a { color: red }', theme)).toBe('a { color: red }');
    expect(expandTemplates('a { color: ${nope} }', theme)).toBe('a { color: ${nope} }');
  });
});
