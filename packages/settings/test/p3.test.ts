import { describe, expect, it } from 'vitest';
import {
  ImportError,
  SYNC_CHUNK,
  SYNC_MAX_CHUNKS,
  type Settings,
  defaultSettings,
  exportSettings,
  fromSyncItems,
  importSettings,
  migrate,
  resolve,
  ruleKey,
  setRuleRemap,
  staleSyncKeys,
  toPageLocation,
  toSyncItems,
  updateRule,
} from '../src';

const loc = toPageLocation('https://docs.example.com/a/b')!;
const ctx = { automationActive: true };

describe('schema v2', () => {
  it('migrates v1 settings and fills the new defaults', () => {
    const s = migrate({ version: 1, defaultMode: 'filtered', rules: {} });
    expect(s.version).toBe(2);
    expect(s.defaultMode).toBe('filtered');
    expect(s.integration).toBe('site');
    expect(s.pdf.enabled).toBe(true);
    expect(s.sync).toBe(false);
  });

  it('drops invalid remaps, oversized CSS and unknown integration values', () => {
    const s = migrate({
      version: 2,
      rules: {
        x: {
          level: 'domain',
          match: 'example.com',
          remap: { '#F00': '#0f0', bad: '#000', '#123456': 'red' },
          css: 'a'.repeat(30_000),
          integration: 'maybe',
        },
      },
    });
    const rule = s.rules[ruleKey('domain', 'example.com')]!;
    expect(rule.remap).toEqual({ '#ff0000': '#00ff00' });
    expect(rule.css).toBeUndefined();
    expect(rule.integration).toBeUndefined();
  });
});

describe('resolve with v2 fields', () => {
  it('merges remaps, stacks CSS in precedence order and lets the most specific integration win', () => {
    let s: Settings = defaultSettings();
    s = setRuleRemap(s, 'domain', 'example.com', '#ff0000', '#00ff00');
    s = setRuleRemap(s, 'domain', 'example.com', '#0000ff', '#ffff00');
    s = setRuleRemap(s, 'subdomain', 'docs.example.com', '#ff0000', '#ffffff');
    s = updateRule(s, 'domain', 'example.com', { css: 'a{}', integration: 'convert' });
    s = updateRule(s, 'page', 'docs.example.com/a/b', { css: 'b{}', integration: 'off' });
    const r = resolve(s, loc, ctx);
    expect(r.remap).toEqual({ '#ff0000': '#ffffff', '#0000ff': '#ffff00' });
    expect(r.css).toBe('a{}\nb{}');
    expect(r.integration).toBe('off');
  });

  it('removes a rule when its last field is cleared', () => {
    let s = setRuleRemap(defaultSettings(), 'domain', 'example.com', '#fff', '#000');
    expect(Object.keys(s.rules)).toHaveLength(1);
    s = setRuleRemap(s, 'domain', 'example.com', '#ffffff', undefined);
    expect(s.rules).toEqual({});
  });
});

describe('export and import', () => {
  it('round-trips its own format', () => {
    const s = updateRule(defaultSettings(), 'domain', 'example.com', { mode: 'filtered' });
    const { settings, source } = importSettings(exportSettings(s));
    expect(source).toBe('smart-dark-mode');
    expect(settings).toEqual(s);
  });

  it('imports a Dark Reader export', () => {
    const dr = {
      enabled: true,
      theme: { mode: 1, brightness: 110, contrast: 90, grayscale: 20, sepia: 10 },
      enabledByDefault: true,
      enabledFor: [],
      disabledFor: ['www.example.com', 'mail.google.com/mail/*'],
      customThemes: [{ url: ['github.com'], theme: { mode: 1, brightness: 80, contrast: 100 } }],
      automation: { enabled: true, mode: 'time', behavior: 'OnOff' },
      time: { activation: '18:00', deactivation: '9:00' },
    };
    const { settings, source } = importSettings(JSON.stringify(dr));
    expect(source).toBe('darkreader');
    expect(settings.adjust).toMatchObject({
      brightness: 110,
      contrast: 90,
      saturation: 80,
      warmth: 10,
    });
    expect(settings.rules[ruleKey('domain', 'example.com')]?.mode).toBe('normal');
    expect(settings.rules[ruleKey('pattern', 'mail.google.com/mail/*')]?.mode).toBe('normal');
    expect(settings.rules[ruleKey('domain', 'github.com')]?.adjust?.brightness).toBe(80);
    expect(settings.automation).toEqual({
      kind: 'schedule',
      schedule: { from: '18:00', to: '09:00' },
    });
  });

  it('maps an old Dark Reader allowlist', () => {
    const { settings } = importSettings(
      JSON.stringify({ theme: { mode: 1 }, siteList: ['a.com'], applyToListedOnly: true }),
    );
    expect(settings.listMode).toBe('allowlist');
    expect(settings.rules[ruleKey('domain', 'a.com')]?.mode).toBe('dark');
  });

  it('rejects other files with a reason', () => {
    expect(() => importSettings('nope')).toThrow(ImportError);
    expect(() => importSettings('{"hello":1}')).toThrow('unknown-format');
  });
});

describe('sync chunking', () => {
  it('splits and joins', () => {
    const json = JSON.stringify({ text: 'x'.repeat(SYNC_CHUNK * 2 + 10) });
    const items = toSyncItems(json, 1)!;
    expect(Object.keys(items)).toHaveLength(4);
    expect(fromSyncItems(items)?.json).toBe(json);
  });

  it('refuses data that would exceed the quota', () => {
    expect(toSyncItems('x'.repeat(SYNC_CHUNK * SYNC_MAX_CHUNKS + 1), 1)).toBeNull();
  });

  it('detects missing or corrupted chunks', () => {
    const items = toSyncItems('x'.repeat(SYNC_CHUNK + 5), 1)!;
    expect(fromSyncItems({ ...items, 'sdm-sync:1': 'y' })).toBeNull();
    const partial = Object.fromEntries(Object.entries(items).filter(([k]) => k !== 'sdm-sync:0'));
    expect(fromSyncItems(partial)).toBeNull();
  });

  it('lists keys left over from a larger write', () => {
    expect(staleSyncKeys(4, 2)).toEqual(['sdm-sync:2', 'sdm-sync:3']);
  });
});
