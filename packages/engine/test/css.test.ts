import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, parseColor, rgbToOklch } from '../src/color';
import {
  type RuleLike,
  type StyleLike,
  VarRegistry,
  rewriteRules,
  rewriteValue,
  scanUsage,
} from '../src/css';

function style(decls: Record<string, string>): StyleLike {
  const entries = Object.entries(decls);
  const s: Record<number, string> & StyleLike = {
    length: entries.length,
    getPropertyValue: (p: string) => decls[p]?.replace(/\s*!important$/, '') ?? '',
    getPropertyPriority: (p: string) => (decls[p]?.endsWith('!important') ? 'important' : ''),
  } as never;
  entries.forEach(([k], i) => ((s as Record<number, string>)[i] = k));
  return s;
}

function rule(selectorText: string, decls: Record<string, string>): RuleLike {
  return { selectorText, style: style(decls), cssText: `${selectorText} {}` };
}

const opts = () => ({ theme: DEFAULT_THEME, vars: new VarRegistry() });

describe('rewriteValue', () => {
  const ctx = { theme: DEFAULT_THEME, rewriteVars: true };
  it('leaves urls and non-colours alone', () => {
    expect(rewriteValue('url(white.png) no-repeat', 'background', ctx)).toBeNull();
    expect(rewriteValue('1px solid', 'border', ctx)).toBeNull();
  });
  it('rewrites colours inside gradients and shorthands', () => {
    const v = rewriteValue(
      'linear-gradient(#fff, rgb(240 240 240)) , url("a#fff.png")',
      'background',
      ctx,
    )!;
    expect(v).toContain('url("a#fff.png")');
    expect(v).not.toContain('#fff,');
    expect(v.match(/rgb\(/g)?.length).toBe(2);
  });
  it('rewrites var() to role twins with fallback', () => {
    expect(rewriteValue('var(--bg)', 'background', ctx)).toBe(
      'var(--sdm-background--bg, var(--bg))',
    );
    expect(rewriteValue('var(--a, white)', 'text', ctx)).toMatch(
      /^var\(--sdm-text--a, var\(--a,\s*rgb/,
    );
  });
  it('does not treat words that contain colour names as colours', () => {
    expect(rewriteValue('redirect', 'text', ctx)).toBeNull();
  });
});

describe('rewriteRules', () => {
  it('keeps selectors, importance and only colour declarations', () => {
    const css = rewriteRules(
      [
        rule('body', {
          'background-color': 'white',
          'font-size': '16px',
          color: '#111 !important',
        }),
      ],
      opts(),
    );
    expect(css).toMatch(
      /^body \{ background-color: rgb\([^)]+\); color: rgb\([^)]+\) !important; \}$/,
    );
    expect(css).not.toContain('font-size');
  });

  it('wraps grouping rules with their header', () => {
    const media: RuleLike = {
      cssText: '@media (min-width: 600px) { .a { color: black; } }',
      cssRules: [rule('.a', { color: 'black' })],
    };
    const layer: RuleLike = {
      cssText: '@layer base { }',
      cssRules: [rule('.b', { background: 'white' })],
    };
    const css = rewriteRules([media, layer], opts());
    expect(css).toContain('@media (min-width: 600px) { .a {');
    expect(css).toContain('@layer base { .b { background: rgb(');
  });

  it('splits custom properties by how they are used', () => {
    const rules = [
      rule(':root', { '--brand': '#0969da', '--surface': '#ffffff', '--alias': 'var(--brand)' }),
      rule('.btn', { 'background-color': 'var(--brand)' }),
      rule('a', { color: 'var(--alias)' }),
    ];
    const o = opts();
    scanUsage(rules, o.vars);
    const css = rewriteRules(rules, o);
    expect(css).toContain('--sdm-background--brand:');
    expect(css).toContain('--sdm-text--brand:');
    expect(css).toContain('--sdm-background--surface:');
    expect(css).toContain('--sdm-text--alias: var(--sdm-text--brand, var(--brand))');
    expect(css).toContain('.btn { background-color: var(--sdm-background--brand, var(--brand)); }');
  });

  it('enforces contrast when a rule sets both text and background', () => {
    const css = rewriteRules([rule('.x', { 'background-color': '#fff', color: '#ddd' })], opts());
    const fg = /color: (rgb\([^)]+\))/.exec(css.split('; ')[1]!)![1]!;
    expect(rgbToOklch(parseColor(fg)!).l).toBeGreaterThan(0.6);
  });

  it('rewrites keyframes', () => {
    const kf: RuleLike = {
      cssText: '@keyframes flash { }',
      cssRules: [
        { keyText: '0%', style: style({ 'background-color': 'white' }), cssText: '0% {}' },
      ],
    };
    expect(rewriteRules([kf], opts())).toMatch(/^@keyframes flash \{ 0% \{ background-color: rgb/);
  });
});

describe('url handling', () => {
  it('absolutises relative urls in rewritten declarations', () => {
    const v = rewriteValue('url(img/bg.png) #fff', 'background', {
      theme: DEFAULT_THEME,
      rewriteVars: true,
      baseUrl: 'https://cdn.example.com/css/site.css',
    });
    expect(v).toContain('url("https://cdn.example.com/css/img/bg.png")');
  });
});
