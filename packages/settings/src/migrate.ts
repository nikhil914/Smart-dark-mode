import {
  type Adjustments,
  type Settings,
  type SiteRule,
  type CustomTheme,
  type IntegrationChoice,
  type ThemeId,
  ADJUSTMENT_LIMITS,
  BUILT_IN_THEME_IDS,
  CUSTOM_THEME_KEYS,
  MAX_CUSTOM_THEMES,
  SATURATION_PRESETS,
  THEME_SHARE_PREFIX,
  INTEGRATION_CHOICES,
  MAX_REMAPS,
  MAX_RULE_CSS,
  MODES,
  PDF_STYLES,
  RULE_LEVELS,
  SCHEMA_VERSION,
  clampAdjustment,
  defaultCustomColors,
  defaultSettings,
  normalizeHex,
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
  // v2 adds remap, css and integration to rules and integration, pdf and sync to settings.
  // Every new field has a default, so the data itself needs no change.
  1: (input) => ({ ...input, version: 2 }),
  // v3 adds themes, custom themes, image options, diagnosis and fixes updates (all defaulted).
  2: (input) => ({ ...input, version: 3 }),
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

const CUSTOM_ID = /^custom:[a-z0-9-]{1,40}$/;

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === 'string' &&
    ((BUILT_IN_THEME_IDS as readonly string[]).includes(value) || CUSTOM_ID.test(value))
  );
}

export function sanitizeCustomTheme(value: unknown): CustomTheme | null {
  if (!isRecord(value) || !isRecord(value.colors)) return null;
  const { id, name } = value;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) return null;
  const colors = defaultCustomColors();
  for (const key of CUSTOM_THEME_KEYS) {
    const v = value.colors[key];
    const hex = typeof v === 'string' ? normalizeHex(v) : null;
    if (hex) colors[key] = hex;
  }
  const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : id;
  return { id, name: label, colors };
}

function sanitizeRule(value: unknown): SiteRule | null {
  if (!isRecord(value)) return null;
  const { level, match, mode, adjust, inheritSubdomains, remap, css, integration, theme } = value;
  if (typeof level !== 'string' || !RULE_LEVELS.includes(level as SiteRule['level'])) return null;
  if (typeof match !== 'string' || match.length === 0 || match.length > 2048) return null;
  const rule: SiteRule = { level: level as SiteRule['level'], match };
  if (typeof mode === 'string' && MODES.includes(mode as SiteRule['mode'] & string)) {
    rule.mode = mode as NonNullable<SiteRule['mode']>;
  }
  const adj = sanitizeAdjust(adjust);
  if (Object.keys(adj).length > 0) rule.adjust = adj;
  if (typeof inheritSubdomains === 'boolean') rule.inheritSubdomains = inheritSubdomains;
  if (isRecord(remap)) {
    const out: Record<string, string> = {};
    for (const [from, to] of Object.entries(remap).slice(0, MAX_REMAPS)) {
      const a = normalizeHex(from);
      const b = typeof to === 'string' ? normalizeHex(to) : null;
      if (a && b) out[a] = b;
    }
    if (Object.keys(out).length > 0) rule.remap = out;
  }
  if (typeof css === 'string' && css.trim() && css.length <= MAX_RULE_CSS) rule.css = css;
  if (typeof integration === 'string' && INTEGRATION_CHOICES.includes(integration as never)) {
    rule.integration = integration as IntegrationChoice;
  }
  if (isThemeId(theme)) rule.theme = theme;
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
  if (
    typeof data.integration === 'string' &&
    INTEGRATION_CHOICES.includes(data.integration as never)
  ) {
    out.integration = data.integration as IntegrationChoice;
  }
  if (isRecord(data.pdf)) {
    const { enabled, style, background, text } = data.pdf;
    if (typeof enabled === 'boolean') out.pdf.enabled = enabled;
    if (typeof style === 'string' && PDF_STYLES.includes(style as never)) {
      out.pdf.style = style as Settings['pdf']['style'];
    }
    const bg = typeof background === 'string' ? normalizeHex(background) : null;
    const fg = typeof text === 'string' ? normalizeHex(text) : null;
    if (bg) out.pdf.background = bg;
    if (fg) out.pdf.text = fg;
  }
  if (typeof data.sync === 'boolean') out.sync = data.sync;
  if (Array.isArray(data.customThemes)) {
    const seen = new Set<string>();
    for (const value of data.customThemes.slice(0, MAX_CUSTOM_THEMES)) {
      const theme = sanitizeCustomTheme(value);
      if (theme && !seen.has(theme.id)) {
        seen.add(theme.id);
        out.customThemes.push(theme);
      }
    }
  }
  if (isThemeId(data.theme)) out.theme = data.theme;
  if (typeof data.preset === 'string' && SATURATION_PRESETS.includes(data.preset as never)) {
    out.preset = data.preset as Settings['preset'];
  }
  if (isRecord(data.images)) {
    if (typeof data.images.hoverOriginal === 'boolean') {
      out.images.hoverOriginal = data.images.hoverOriginal;
    }
    if (typeof data.images.photoDim === 'number' && Number.isFinite(data.images.photoDim)) {
      out.images.photoDim = Math.min(40, Math.max(0, Math.round(data.images.photoDim)));
    }
  }
  if (typeof data.diagnosis === 'boolean') out.diagnosis = data.diagnosis;
  if (typeof data.fixesUpdates === 'boolean') out.fixesUpdates = data.fixesUpdates;
  return out;
}

/** Reads a theme share code (or the JSON inside one). Returns null when it is not valid. */
export function parseThemeShareCode(code: string, id: string): CustomTheme | null {
  let text = code.trim();
  if (text.startsWith(THEME_SHARE_PREFIX)) {
    const b64 = text.slice(THEME_SHARE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    try {
      const binary = atob(b64);
      text = new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
    } catch {
      return null;
    }
  }
  if (text.length > 4000) return null;
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) ? sanitizeCustomTheme({ ...data, id }) : null;
  } catch {
    return null;
  }
}
