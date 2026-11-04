import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, defaultSettings, migrate } from '../src';

describe('migrate', () => {
  it('returns defaults for garbage', () => {
    expect(migrate(null)).toEqual(defaultSettings());
    expect(migrate('x')).toEqual(defaultSettings());
    expect(migrate([1, 2])).toEqual(defaultSettings());
  });

  it('upgrades an unversioned object and keeps valid fields', () => {
    const out = migrate({ enabled: false, defaultMode: 'filtered' });
    expect(out.version).toBe(SCHEMA_VERSION);
    expect(out.enabled).toBe(false);
    expect(out.defaultMode).toBe('filtered');
  });

  it('clamps adjustments and drops invalid rules', () => {
    const out = migrate({
      version: 1,
      adjust: { brightness: 999, warmth: -5, dim: 'x' },
      rules: {
        a: { level: 'domain', match: 'a.com', mode: 'dark' },
        b: { level: 'nonsense', match: 'b.com' },
        c: { level: 'page', match: '' },
        d: { level: 'subdomain', match: 'd.a.com', mode: 'purple', adjust: { contrast: 10 } },
      },
    });
    expect(out.adjust.brightness).toBe(150);
    expect(out.adjust.warmth).toBe(0);
    expect(out.adjust.dim).toBe(0);
    expect(Object.keys(out.rules).sort()).toEqual(['domain:a.com', 'subdomain:d.a.com']);
    expect(out.rules['subdomain:d.a.com']).toEqual({
      level: 'subdomain',
      match: 'd.a.com',
      adjust: { contrast: 50 },
    });
  });

  it('reads settings written by a newer version without losing known fields', () => {
    const out = migrate({ version: SCHEMA_VERSION + 5, listMode: 'allowlist', futureField: 1 });
    expect(out.listMode).toBe('allowlist');
    expect(out).not.toHaveProperty('futureField');
  });

  it('rejects malformed schedule times', () => {
    const out = migrate({
      version: 1,
      automation: { kind: 'schedule', schedule: { from: '25:00', to: '06:30' } },
    });
    expect(out.automation).toEqual({ kind: 'schedule', schedule: { from: '19:00', to: '06:30' } });
  });
});
