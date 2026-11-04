import {
  type Adjustments,
  type Mode,
  type RuleLevel,
  type Settings,
  type SiteRule,
  RULE_LEVELS,
} from './schema';
import { type PageLocation, compilePattern, pageKey } from './url';

export interface Resolved {
  mode: Mode;
  adjust: Adjustments;
  /** Rules that applied, lowest precedence first. Shown in the UI as "why". */
  applied: SiteRule[];
  /** True when the master switch, list mode or automation forced `normal`. */
  suppressedBy: 'disabled' | 'allowlist' | 'automation' | null;
}

const patternCache = new Map<string, RegExp | null>();

function patternFor(match: string): RegExp | null {
  let re = patternCache.get(match);
  if (re === undefined) {
    re = compilePattern(match);
    if (patternCache.size > 500) patternCache.clear();
    patternCache.set(match, re);
  }
  return re;
}

export function ruleMatches(rule: SiteRule, loc: PageLocation): boolean {
  const match = rule.match.toLowerCase();
  switch (rule.level) {
    case 'domain':
      return (
        loc.host === match || ((rule.inheritSubdomains ?? true) && loc.host.endsWith(`.${match}`))
      );
    case 'subdomain':
      return loc.host === match;
    case 'pattern':
      return patternFor(rule.match)?.test(pageKey(loc)) ?? false;
    case 'page':
      return pageKey(loc) === match;
  }
}

/** Sort key so that, within a level, longer (more specific) matches win. */
function levelIndex(level: RuleLevel): number {
  return RULE_LEVELS.indexOf(level);
}

export function matchingRules(settings: Settings, loc: PageLocation): SiteRule[] {
  return Object.values(settings.rules)
    .filter((rule) => ruleMatches(rule, loc))
    .sort((a, b) => levelIndex(a.level) - levelIndex(b.level) || a.match.length - b.match.length);
}

export interface ResolveContext {
  /** Whether automation currently allows dark mode (schedule window or OS scheme). */
  automationActive: boolean;
}

/**
 * Resolves the effective mode and adjustments for a page.
 * Precedence: global defaults < domain < subdomain < URL pattern < page.
 * Later rules override earlier ones field by field.
 */
export function resolve(settings: Settings, loc: PageLocation, ctx: ResolveContext): Resolved {
  const applied = matchingRules(settings, loc);
  let mode: Mode = settings.defaultMode;
  let explicitMode = false;
  const adjust: Adjustments = { ...settings.adjust };
  for (const rule of applied) {
    if (rule.mode) {
      mode = rule.mode;
      explicitMode = true;
    }
    if (rule.adjust) Object.assign(adjust, rule.adjust);
  }

  let suppressedBy: Resolved['suppressedBy'] = null;
  if (!settings.enabled) suppressedBy = 'disabled';
  else if (settings.listMode === 'allowlist' && !explicitMode) suppressedBy = 'allowlist';
  else if (!ctx.automationActive) suppressedBy = 'automation';

  return { mode: suppressedBy ? 'normal' : mode, adjust, applied, suppressedBy };
}
