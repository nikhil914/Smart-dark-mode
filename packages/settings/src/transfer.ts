import { migrate } from './migrate';
import {
  type Adjustments,
  type Settings,
  type SiteRule,
  clampAdjustment,
  defaultSettings,
  ruleKey,
} from './schema';
import { parseTime } from './schedule';

export const EXPORT_FORMAT = 'smart-dark-mode';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  settings: Settings;
}

export function exportSettings(settings: Settings, now = new Date()): string {
  const file: ExportFile = { format: EXPORT_FORMAT, exportedAt: now.toISOString(), settings };
  return JSON.stringify(file, null, 2);
}

export type ImportSource = 'smart-dark-mode' | 'darkreader';

export interface ImportResult {
  settings: Settings;
  source: ImportSource;
  /** Things that could not be carried over, in plain words for the UI. */
  skipped: string[];
}

export class ImportError extends Error {
  constructor(public readonly code: 'not-json' | 'unknown-format' | 'too-large') {
    super(code);
  }
}

/** Largest import accepted. Sync quota is ~100 KB, so a valid file is far below this. */
export const MAX_IMPORT_BYTES = 2_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads an export file. Accepts this extension's own format (any schema version) and
 * Dark Reader's settings export. Night Eye has no documented export format, so its
 * files are reported as unknown.
 */
export function importSettings(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('too-large');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('not-json');
  }
  if (!isRecord(data)) throw new ImportError('unknown-format');
  if (data.format === EXPORT_FORMAT && isRecord(data.settings)) {
    return { settings: migrate(data.settings), source: 'smart-dark-mode', skipped: [] };
  }
  if (isDarkReader(data)) return fromDarkReader(data);
  throw new ImportError('unknown-format');
}

function isDarkReader(data: Record<string, unknown>): boolean {
  return (
    isRecord(data.theme) &&
    ('enabledByDefault' in data || 'siteList' in data || 'disabledFor' in data)
  );
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 2048)
    : [];
}

/**
 * Dark Reader site entries are hostnames, optionally with a path or `*` wildcards.
 * Plain hostnames become domain rules; anything else becomes a pattern rule.
 */
function ruleFromDarkReaderEntry(entry: string): Pick<SiteRule, 'level' | 'match'> {
  const clean = entry
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
  const host = clean.replace(/^www\./, '');
  if (/^[a-z0-9.-]+$/.test(host)) return { level: 'domain', match: host };
  return { level: 'pattern', match: clean };
}

function adjustFromDarkReaderTheme(theme: Record<string, unknown>): Partial<Adjustments> {
  const out: Partial<Adjustments> = {};
  if (typeof theme.brightness === 'number') {
    out.brightness = clampAdjustment('brightness', theme.brightness);
  }
  if (typeof theme.contrast === 'number')
    out.contrast = clampAdjustment('contrast', theme.contrast);
  if (typeof theme.grayscale === 'number') {
    out.saturation = clampAdjustment('saturation', 100 - theme.grayscale);
  }
  if (typeof theme.sepia === 'number') out.warmth = clampAdjustment('warmth', theme.sepia);
  return out;
}

function fromDarkReader(data: Record<string, unknown>): ImportResult {
  const settings = defaultSettings();
  const skipped: string[] = [];
  const theme = data.theme as Record<string, unknown>;
  settings.adjust = { ...settings.adjust, ...adjustFromDarkReaderTheme(theme) };
  if (typeof data.enabled === 'boolean') settings.enabled = data.enabled;

  // Newer releases: enabledByDefault + enabledFor/disabledFor.
  // Older releases: siteList + applyToListedOnly (+ siteListEnabled).
  const allowlist =
    data.enabledByDefault === false ||
    (data.enabledByDefault === undefined && data.applyToListedOnly === true);
  settings.listMode = allowlist ? 'allowlist' : 'blocklist';

  const add = (entry: string, mode: NonNullable<SiteRule['mode']>) => {
    const base = ruleFromDarkReaderEntry(entry);
    settings.rules[ruleKey(base.level, base.match)] = { ...base, mode };
  };
  const enabledFor = [...strings(data.enabledFor), ...(allowlist ? strings(data.siteList) : [])];
  const disabledFor = [...strings(data.disabledFor), ...(allowlist ? [] : strings(data.siteList))];
  for (const entry of enabledFor) add(entry, 'dark');
  for (const entry of disabledFor) add(entry, 'normal');

  if (Array.isArray(data.customThemes)) {
    for (const custom of data.customThemes) {
      if (!isRecord(custom) || !isRecord(custom.theme)) continue;
      const adjust = adjustFromDarkReaderTheme(custom.theme);
      for (const entry of strings(custom.url)) {
        const base = ruleFromDarkReaderEntry(entry);
        const key = ruleKey(base.level, base.match);
        settings.rules[key] = { ...base, ...settings.rules[key], adjust };
      }
    }
  }

  const automation = data.automation;
  const time = isRecord(data.time) ? data.time : null;
  const mode = isRecord(automation) ? automation.mode : automation;
  const on = isRecord(automation) ? automation.enabled !== false : Boolean(automation);
  if (on && mode === 'system') settings.automation.kind = 'system';
  else if (on && mode === 'time' && time) {
    const from = typeof time.activation === 'string' ? padTime(time.activation) : null;
    const to = typeof time.deactivation === 'string' ? padTime(time.deactivation) : null;
    if (from && to) settings.automation = { kind: 'schedule', schedule: { from, to } };
  } else if (on && mode === 'location') {
    skipped.push('location-schedule');
  }

  if (Array.isArray(data.presets) && data.presets.length) skipped.push('presets');
  if (theme.mode === 0) skipped.push('light-scheme');
  if (isRecord(data.syncSitesFixes) || typeof data.fetchNews === 'boolean') {
    // Preferences with no equivalent here; nothing to report.
  }
  return { settings: migrate(settings), source: 'darkreader', skipped };
}

function padTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const t = `${m[1]!.padStart(2, '0')}:${m[2]}`;
  return parseTime(t) === null ? null : t;
}
