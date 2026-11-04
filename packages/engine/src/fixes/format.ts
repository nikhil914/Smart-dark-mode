/**
 * Site fixes: small per-site corrections, shipped as data (never code) so they can be
 * updated without a release (F12). The format is JSON; Dark Reader's text format is
 * converted into it by `parseDarkReaderFixes`.
 */

export const FIXES_FORMAT = 'sdm-fixes';

export interface SiteFix {
  /** Host patterns, optionally with a path: `example.com`, `*.example.com`, `example.com/app/*`. */
  url: string[];
  /** Extra CSS. `${colour}` templates are converted in dark mode. */
  css?: string;
  /** Elements to show inverted (canvas apps, dark images...). */
  invert?: string[];
  /** Elements whose inline styles must not be converted. */
  ignoreInlineStyle?: string[];
  /** Images that must not be analysed or changed. */
  ignoreImageAnalysis?: string[];
}

export interface FixesBundle {
  format: typeof FIXES_FORMAT;
  /** Increases with every published bundle; older bundles are never applied over newer ones. */
  version: number;
  created: string;
  sites: SiteFix[];
}

const MAX_SITES = 10_000;
const MAX_SELECTORS = 200;
const MAX_CSS = 50_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown, max: number, maxLength = 2000): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= maxLength,
    )
    .map((v) => v.trim())
    .slice(0, max);
  return out.length ? out : undefined;
}

/** Validates untrusted bundle data. Returns null when it is not a usable bundle. */
export function parseFixesBundle(data: unknown): FixesBundle | null {
  if (!isRecord(data) || data.format !== FIXES_FORMAT) return null;
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    return null;
  }
  if (!Array.isArray(data.sites)) return null;
  const sites: SiteFix[] = [];
  for (const raw of data.sites.slice(0, MAX_SITES)) {
    if (!isRecord(raw)) continue;
    const url = strings(raw.url, 100, 500);
    if (!url) continue;
    const fix: SiteFix = { url };
    if (typeof raw.css === 'string' && raw.css.trim() && raw.css.length <= MAX_CSS) {
      fix.css = raw.css;
    }
    const invert = strings(raw.invert, MAX_SELECTORS);
    const ignoreInline = strings(raw.ignoreInlineStyle, MAX_SELECTORS);
    const ignoreImage = strings(raw.ignoreImageAnalysis, MAX_SELECTORS);
    if (invert) fix.invert = invert;
    if (ignoreInline) fix.ignoreInlineStyle = ignoreInline;
    if (ignoreImage) fix.ignoreImageAnalysis = ignoreImage;
    sites.push(fix);
  }
  return {
    format: FIXES_FORMAT,
    version: data.version,
    created: typeof data.created === 'string' ? data.created : '',
    sites,
  };
}

function patternToRegExp(pattern: string): RegExp {
  const p = pattern
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  const slash = p.indexOf('/');
  const host = slash === -1 ? p : p.slice(0, slash);
  const path = slash === -1 ? '' : p.slice(slash);
  const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  // A bare host also matches its subdomains (Dark Reader semantics).
  const hostRe = host.startsWith('*.')
    ? `(?:.*\\.)?${esc(host.slice(2))}`
    : `(?:.*\\.)?${esc(host)}`;
  const pathRe = path ? esc(path.endsWith('/') ? `${path}*` : path) : '(?:/.*)?';
  return new RegExp(`^${hostRe}${pathRe}$`);
}

const compiled = new Map<string, RegExp>();

export function fixMatches(fix: SiteFix, host: string, path: string): boolean {
  const target = `${host.toLowerCase().replace(/^www\./, '')}${path}`;
  return fix.url.some((pattern) => {
    if (pattern === '*') return false;
    let re = compiled.get(pattern);
    if (!re) {
      re = patternToRegExp(pattern);
      if (compiled.size > 5000) compiled.clear();
      compiled.set(pattern, re);
    }
    return re.test(target);
  });
}

/** Fixes for a page, merged: more specific (longer) URL patterns last, so they win in CSS. */
export function fixesFor(bundles: (FixesBundle | null)[], host: string, path: string): SiteFix {
  const matches: SiteFix[] = [];
  for (const bundle of bundles) {
    if (!bundle) continue;
    for (const fix of bundle.sites) if (fixMatches(fix, host, path)) matches.push(fix);
  }
  matches.sort(
    (a, b) => Math.max(...a.url.map((u) => u.length)) - Math.max(...b.url.map((u) => u.length)),
  );
  const merged: SiteFix = { url: [] };
  for (const fix of matches) {
    merged.url.push(...fix.url);
    if (fix.css) merged.css = merged.css ? `${merged.css}\n${fix.css}` : fix.css;
    for (const key of ['invert', 'ignoreInlineStyle', 'ignoreImageAnalysis'] as const) {
      const list = fix[key];
      if (list) merged[key] = [...(merged[key] ?? []), ...list];
    }
  }
  return merged;
}

/** CSS that applies `invert` selectors, re-inverting images inside them so photos look right. */
export function invertCss(selectors: readonly string[]): string {
  if (!selectors.length) return '';
  const list = selectors.join(',\n');
  const inner = selectors.map((s) => `${s} img, ${s} video`).join(',\n');
  return `${list} { filter: invert(0.9) hue-rotate(180deg) !important; }\n${inner} { filter: invert(1) hue-rotate(180deg) !important; }\n`;
}
