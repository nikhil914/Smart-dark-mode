/**
 * Settings schema. Every stored shape carries `version`; bump it and add a
 * migration in `migrate.ts` whenever a stored field changes meaning or type.
 */

export const SCHEMA_VERSION = 1;

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
}

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
