import { describe, expect, it } from 'vitest';
import {
  type Settings,
  defaultCustomColors,
  defaultSettings,
  migrate,
  parseThemeShareCode,
  resolve,
  themeShareCode,
  toPageLocation,
  updateRule,
} from '../src';

describe('schema v3', () => {
  it('migrates v2 and fills theme defaults', () => {
    const s = migrate({ version: 2, sync: true });
    expect(s.version).toBe(3);
    expect(s.sync).toBe(true);
    expect(s.theme).toBe('dark');
    expect(s.images).toEqual({ hoverOriginal: true, photoDim: 0 });
  });

  it('keeps valid themes and drops invalid ones', () => {
    const s = migrate({
      version: 3,
      theme: 'custom:mine',
      customThemes: [
        { id: 'mine', name: 'Mine', colors: { background: '#000', text: 'nope' } },
        { id: 'Bad Id', name: 'x', colors: {} },
      ],
      images: { photoDim: 90 },
      rules: { r: { level: 'domain', match: 'a.com', theme: 'amoled' } },
    });
    expect(s.theme).toBe('custom:mine');
    expect(s.customThemes).toHaveLength(1);
    expect(s.customThemes[0]!.colors.background).toBe('#000000');
    expect(s.customThemes[0]!.colors.text).toBe(defaultCustomColors().text);
    expect(s.images.photoDim).toBe(40);
    expect(s.rules['domain:a.com']?.theme).toBe('amoled');
    expect(migrate({ version: 3, theme: 'neon' }).theme).toBe('dark');
  });

  it('resolves the most specific theme', () => {
    let s: Settings = { ...defaultSettings(), theme: 'sepia' };
    s = updateRule(s, 'domain', 'example.com', { theme: 'amoled' });
    const loc = toPageLocation('https://www.example.com/')!;
    expect(resolve(s, loc, { automationActive: true }).theme).toBe('amoled');
    expect(
      resolve(s, toPageLocation('https://other.org/')!, { automationActive: true }).theme,
    ).toBe('sepia');
  });
});

describe('theme share codes', () => {
  it('round-trip', () => {
    const theme = {
      id: 'a',
      name: 'Ünïcode night',
      colors: { ...defaultCustomColors(), link: '#ff8800' },
    };
    const code = themeShareCode(theme);
    expect(code.startsWith('sdm-theme:')).toBe(true);
    expect(parseThemeShareCode(code, 'b')).toEqual({ ...theme, id: 'b' });
  });

  it('accept raw JSON and reject garbage', () => {
    expect(
      parseThemeShareCode('{"name":"x","colors":{"background":"#111"}}', 'c')?.colors.background,
    ).toBe('#111111');
    expect(parseThemeShareCode('sdm-theme:!!!', 'd')).toBeNull();
    expect(parseThemeShareCode('hello', 'e')).toBeNull();
  });
});
