import {
  type Adjustments,
  type Settings,
  type SiteRule,
  ADJUSTMENT_LIMITS,
  MODES,
  RULE_LEVELS,
  SCHEMA_VERSION,
  clampAdjustment,
  defaultSettings,
  ruleKey,
} from './schema';
import { parseTime } from './schedule';

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * `MIGRATIONS[n]` upgrades a stored object from version n to n + 1.
 * Version 0 is "no version field" (never written by a release, reserved for imports).
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (input) => ({ ...input, version: 1 }),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeAdjust(value: unknown): Partial<Adjustments> {
  if (!isRecord(value)) return {};
  const out: Partial<Adjustments> = {};
  for (const key of Object.keys(ADJUSTMENT_LIMITS) as (keyof Adjustments)[]) {
    const v = value[key];
    if (typeof v === 'number') out[key] = clampAdjustment(key, v);
  }
  return out;
}

function sanitizeRule(value: unknown): SiteRule | null {
  if (!isRecord(value)) return null;
  const { level, match, mode, adjust, inheritSubdomains } = value;
  if (typeof level !== 'string' || !RULE_LEVELS.includes(level as SiteRule['level'])) return null;
  if (typeof match !== 'string' || match.length === 0 || match.length > 2048) return null;
  const rule: SiteRule = { level: level as SiteRule['level'], match };
  if (typeof mode === 'string' && MODES.includes(mode as SiteRule['mode'] & string)) {
    rule.mode = mode as NonNullable<SiteRule['mode']>;
  }
  const adj = sanitizeAdjust(adjust);
  if (Object.keys(adj).length > 0) rule.adjust = adj;
  if (typeof inheritSubdomains === 'boolean') rule.inheritSubdomains = inheritSubdomains;
  return rule;
}

/**
 * Turns anything read from storage or an import file into valid current-version
 * settings. Unknown or invalid fields fall back to defaults; it never throws.
 */
export function migrate(raw: unknown): Settings {
  const base = defaultSettings();
  if (!isRecord(raw)) return base;

  let data: Record<string, unknown> = raw;
  let version = typeof data.version === 'number' ? data.version : 0;
  if (version > SCHEMA_VERSION) {
    // Written by a newer release (e.g. synced from another browser). Read what we understand.
    version = SCHEMA_VERSION;
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return base;
    data = step(data);
    version += 1;
  }

  const out = base;
  if (typeof data.enabled === 'boolean') out.enabled = data.enabled;
  if (
    typeof data.defaultMode === 'string' &&
    MODES.includes(data.defaultMode as Settings['defaultMode'])
  ) {
    out.defaultMode = data.defaultMode as Settings['defaultMode'];
  }
  out.adjust = { ...out.adjust, ...sanitizeAdjust(data.adjust) };
  if (data.listMode === 'allowlist' || data.listMode === 'blocklist') out.listMode = data.listMode;

  if (isRecord(data.rules)) {
    for (const value of Object.values(data.rules)) {
      const rule = sanitizeRule(value);
      if (rule) out.rules[ruleKey(rule.level, rule.match)] = rule;
    }
  }

  if (isRecord(data.automation)) {
    const { kind, schedule } = data.automation;
    if (kind === 'off' || kind === 'schedule' || kind === 'system') out.automation.kind = kind;
    if (isRecord(schedule)) {
      if (typeof schedule.from === 'string' && parseTime(schedule.from) !== null) {
        out.automation.schedule.from = schedule.from;
      }
      if (typeof schedule.to === 'string' && parseTime(schedule.to) !== null) {
        out.automation.schedule.to = schedule.to;
      }
    }
  }
  return out;
}
