import { describe, expect, it } from 'vitest';
import {
  type Settings,
  defaultSettings,
  resolve,
  ruleKey,
  setInheritSubdomains,
  setRuleAdjust,
  setRuleMode,
  toPageLocation,
} from '../src';

const ACTIVE = { automationActive: true };

function at(url: string) {
  const loc = toPageLocation(url);
  if (!loc) throw new Error(`unsupported url ${url}`);
  return loc;
}

describe('resolve', () => {
  it('uses global defaults when no rule matches', () => {
    const r = resolve(defaultSettings(), at('https://example.com/'), ACTIVE);
    expect(r.mode).toBe('dark');
    expect(r.applied).toEqual([]);
    expect(r.suppressedBy).toBeNull();
  });

  it('applies precedence global < domain < subdomain < pattern < page', () => {
    let s: Settings = defaultSettings();
    s = setRuleMode(s, 'domain', 'google.com', 'filtered');
    s = setRuleMode(s, 'subdomain', 'docs.google.com', 'dark');
    s = setRuleMode(s, 'pattern', 'docs.google.com/spreadsheets/*', 'normal');
    s = setRuleMode(s, 'page', 'docs.google.com/spreadsheets/d/1', 'filtered');

    expect(resolve(s, at('https://mail.google.com/'), ACTIVE).mode).toBe('filtered');
    expect(resolve(s, at('https://docs.google.com/document/d/x'), ACTIVE).mode).toBe('dark');
    expect(resolve(s, at('https://docs.google.com/spreadsheets/d/2'), ACTIVE).mode).toBe('normal');
    expect(resolve(s, at('https://docs.google.com/spreadsheets/d/1'), ACTIVE).mode).toBe(
      'filtered',
    );
  });

  it('merges adjustments field by field across levels', () => {
    let s = defaultSettings();
    s = setRuleAdjust(s, 'domain', 'github.com', 'contrast', 120);
    s = setRuleAdjust(s, 'subdomain', 'gist.github.com', 'brightness', 80);
    const r = resolve(s, at('https://gist.github.com/x'), ACTIVE);
    expect(r.adjust.contrast).toBe(120);
    expect(r.adjust.brightness).toBe(80);
    expect(r.adjust.saturation).toBe(100);
  });

  it('respects inheritSubdomains = false', () => {
    let s = setRuleMode(defaultSettings(), 'domain', 'example.com', 'normal');
    expect(resolve(s, at('https://a.example.com/'), ACTIVE).mode).toBe('normal');
    s = setInheritSubdomains(s, 'example.com', false);
    expect(resolve(s, at('https://a.example.com/'), ACTIVE).mode).toBe('dark');
    expect(resolve(s, at('https://example.com/'), ACTIVE).mode).toBe('normal');
  });

  it('does not match look-alike domains', () => {
    const s = setRuleMode(defaultSettings(), 'domain', 'example.com', 'normal');
    expect(resolve(s, at('https://notexample.com/'), ACTIVE).mode).toBe('dark');
  });

  it('supports regex patterns and ignores invalid ones', () => {
    let s = setRuleMode(
      defaultSettings(),
      'pattern',
      '/^[a-z]+\\.atlassian\\.net\\/wiki\\//',
      'filtered',
    );
    s = setRuleMode(s, 'pattern', '/([/', 'normal');
    expect(resolve(s, at('https://acme.atlassian.net/wiki/page'), ACTIVE).mode).toBe('filtered');
    expect(resolve(s, at('https://acme.atlassian.net/jira'), ACTIVE).mode).toBe('dark');
  });

  it('allowlist mode only enables sites with an explicit mode', () => {
    let s: Settings = { ...defaultSettings(), listMode: 'allowlist' };
    expect(resolve(s, at('https://a.com/'), ACTIVE)).toMatchObject({
      mode: 'normal',
      suppressedBy: 'allowlist',
    });
    s = setRuleMode(s, 'domain', 'a.com', 'dark');
    expect(resolve(s, at('https://a.com/'), ACTIVE).mode).toBe('dark');
  });

  it('master switch and automation force normal but keep the computed adjustments', () => {
    const off = { ...defaultSettings(), enabled: false };
    expect(resolve(off, at('https://a.com/'), ACTIVE).suppressedBy).toBe('disabled');
    const r = resolve(defaultSettings(), at('https://a.com/'), { automationActive: false });
    expect(r).toMatchObject({ mode: 'normal', suppressedBy: 'automation' });
  });

  it('drops a rule that no longer changes anything', () => {
    let s = setRuleMode(defaultSettings(), 'domain', 'a.com', 'dark');
    s = setRuleMode(s, 'domain', 'a.com', undefined);
    expect(s.rules[ruleKey('domain', 'a.com')]).toBeUndefined();
  });

  it('rejects unsupported schemes', () => {
    expect(toPageLocation('chrome://settings')).toBeNull();
    expect(toPageLocation('about:blank')).toBeNull();
    expect(toPageLocation('not a url')).toBeNull();
  });
});
