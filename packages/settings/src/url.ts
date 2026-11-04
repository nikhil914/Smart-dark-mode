/** URL helpers shared by the rules engine and the UI. */

export interface PageLocation {
  /** Lower-case hostname without a trailing dot. */
  host: string;
  /** Path without query or hash, always starting with `/`. */
  path: string;
}

/** Schemes we can style. Everything else (chrome://, about:, store pages) is unsupported. */
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

export function toPageLocation(url: string): PageLocation | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return { host: parsed.protocol === 'file:' ? 'file' : host, path: parsed.pathname || '/' };
}

/** The key the popup uses for "this site": hostname without a leading `www.`. */
export function siteDomain(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

export function pageKey(loc: PageLocation): string {
  return `${loc.host}${loc.path}`;
}

/** Glob over `host/path`: `*` matches any run of characters, everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Compiles a `pattern` rule. `/.../flags` is a regular expression, anything else a glob.
 * Returns null for an invalid regular expression so one bad rule cannot break the page.
 */
export function compilePattern(match: string): RegExp | null {
  const re = /^\/(.+)\/([a-z]*)$/.exec(match);
  if (re) {
    try {
      return new RegExp(re[1] as string, re[2]);
    } catch {
      return null;
    }
  }
  return globToRegExp(match);
}
