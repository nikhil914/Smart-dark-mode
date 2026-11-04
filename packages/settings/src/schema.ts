/**
 * Settings schema. Every stored shape carries `version`; bump it and add a
 * migration in `migrate.ts` whenever a stored field changes meaning or type.
 */

export const SCHEMA_VERSION = 2;

export type Mode = 'dark' | 'filtered' | 'normal';

export const MODES: readonly Mode[] = ['dark', 'filtered', 'normal'];

export interface Adjustments {
  /** Percent, 50–150. 100 = unchanged. */
  brightness: number;
  /** Percent, 50–150. 100 = unchanged. */
  contrast: number;
  /** Percent, 0–150. 100 = unchanged. */
  saturation: number;
  /** Blue-light filter strength, 0–100. */
  warmth: number;
  /** Extra darkening overlay, 0–60. */
  dim: number;
}

export const ADJUSTMENT_LIMITS: Readonly<Record<keyof Adjustments, readonly [number, number]>> = {
  brightness: [50, 150],
  contrast: [50, 150],
  saturation: [0, 150],
  warmth: [0, 100],
  dim: [0, 60],
};

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  dim: 0,
};

/**
 * Rule levels, lowest to highest precedence (after the global defaults).
 * - domain:    `example.com` and, when `inheritSubdomains`, every `*.example.com`
 * - subdomain: one exact hostname, e.g. `docs.example.com`
 * - pattern:   a glob over `host/path` (`*.atlassian.net/wiki/*`) or `/regex/`
 * - page:      one exact `host/path` (no query or hash)
 */
export type RuleLevel = 'domain' | 'subdomain' | 'pattern' | 'page';

export const RULE_LEVELS: readonly RuleLevel[] = ['domain', 'subdomain', 'pattern', 'page'];

export interface SiteRule {
  level: RuleLevel;
  /** Hostname, glob, `/regex/` or `host/path`, depending on `level`. */
  match: string;
  mode?: Mode;
  adjust?: Partial<Adjustments>;
  /** Only meaningful for `domain` rules. Defaults to true. */
  inheritSubdomains?: boolean;
  /** Colour remapping, original `#rrggbb` to replacement `#rrggbb`. Dark mode only. */
  remap?: Record<string, string>;
  /** Extra CSS for matching pages. `${colour}` templates are converted in dark mode. */
  css?: string;
  /** What to do when the site has its own dark theme. */
  integration?: IntegrationChoice;
}

/**
 * Deep Integration, for sites that ship their own dark theme:
 * - site:    switch the site's own theme on where we know how, and never convert it
 * - convert: ignore the site's theme and convert as usual
 * - off:     leave the site completely alone
 */
export type IntegrationChoice = 'site' | 'convert' | 'off';

export const INTEGRATION_CHOICES: readonly IntegrationChoice[] = ['site', 'convert', 'off'];

/** PDF viewer colour styles. */
export type PdfStyle = 'dark' | 'sepia' | 'invert' | 'custom' | 'original';

export const PDF_STYLES: readonly PdfStyle[] = ['dark', 'sepia', 'invert', 'custom', 'original'];

export interface PdfSettings {
  /** Open PDFs in the built-in viewer. */
  enabled: boolean;
  style: PdfStyle;
  /** Used by the `custom` style. */
  background: string;
  text: string;
}

export const MAX_RULE_CSS = 20_000;
export const MAX_REMAPS = 64;

export type ListMode = 'blocklist' | 'allowlist';

export type AutomationKind = 'off' | 'schedule' | 'system';

export interface Schedule {
  /** Local time `HH:MM` when dark mode turns on. */
  from: string;
  /** Local time `HH:MM` when dark mode turns off. May be earlier than `from` (overnight). */
  to: string;
}

export interface Settings {
  version: typeof SCHEMA_VERSION;
  /** Master switch. */
  enabled: boolean;
  defaultMode: Mode;
  adjust: Adjustments;
  /**
   * blocklist: on everywhere except sites whose rule says `normal`.
   * allowlist: off everywhere except sites with a rule that sets a mode.
   */
  listMode: ListMode;
  /** Keyed by `ruleKey(level, match)`. */
  rules: Record<string, SiteRule>;
  automation: {
    kind: AutomationKind;
    schedule: Schedule;
  };
  /** Default Deep Integration choice; rules can override it per site. */
  integration: IntegrationChoice;
  pdf: PdfSettings;
  /** Mirror settings to the browser's sync storage. */
  sync: boolean;
}

export function defaultSettings(): Settings {
  return {
    version: SCHEMA_VERSION,
    enabled: true,
    defaultMode: 'dark',
    adjust: { ...DEFAULT_ADJUSTMENTS },
    listMode: 'blocklist',
    rules: {},
    automation: {
      kind: 'off',
      schedule: { from: '19:00', to: '07:00' },
    },
    integration: 'site',
    pdf: { enabled: true, style: 'dark', background: '#1e1e1e', text: '#e0e0e0' },
    sync: false,
  };
}

export function ruleKey(level: RuleLevel, match: string): string {
  return `${level}:${match}`;
}

export function clampAdjustment(key: keyof Adjustments, value: number): number {
  const [min, max] = ADJUSTMENT_LIMITS[key];
  if (!Number.isFinite(value)) return DEFAULT_ADJUSTMENTS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Normalises a colour key or value for remapping: `#rgb`/`#rrggbb` to lower-case `#rrggbb`. */
export function normalizeHex(value: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const hex = m[1]!.toLowerCase();
  return hex.length === 3 ? `#${[...hex].map((c) => c + c).join('')}` : `#${hex}`;
}
