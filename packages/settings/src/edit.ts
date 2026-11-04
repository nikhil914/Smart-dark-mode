import {
  type Adjustments,
  type Mode,
  type RuleLevel,
  type Settings,
  type SiteRule,
  MAX_REMAPS,
  MODES,
  clampAdjustment,
  normalizeHex,
  ruleKey,
} from './schema';

/** Pure settings updates used by the popup, shortcuts and context menus. */

export function setRuleMode(
  settings: Settings,
  level: RuleLevel,
  match: string,
  mode: Mode | undefined,
): Settings {
  return updateRule(settings, level, match, { mode });
}

type RulePatch = {
  [K in Exclude<keyof SiteRule, 'level' | 'match'>]?: SiteRule[K] | undefined;
};

/** Sets or clears (`undefined`) fields of one rule, creating or dropping the rule as needed. */
export function updateRule(
  settings: Settings,
  level: RuleLevel,
  match: string,
  patch: RulePatch,
): Settings {
  const key = ruleKey(level, match);
  const merged: Record<string, unknown> = { ...(settings.rules[key] ?? { level, match }) };
  for (const [k, v] of Object.entries(patch)) merged[k] = v;
  const rule = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined && v !== ''),
  ) as unknown as SiteRule;
  return withRule(settings, key, rule);
}

/** Adds (`to` set) or removes (`to` undefined) one colour remap on a rule. */
export function setRuleRemap(
  settings: Settings,
  level: RuleLevel,
  match: string,
  from: string,
  to: string | undefined,
): Settings {
  const source = normalizeHex(from);
  if (!source) return settings;
  const existing = settings.rules[ruleKey(level, match)]?.remap ?? {};
  const target = to === undefined ? null : normalizeHex(to);
  let remap: Record<string, string> = omitKey(existing, source);
  if (target) {
    if (Object.keys(remap).length >= MAX_REMAPS) return settings;
    remap = { ...remap, [source]: target };
  }
  return updateRule(settings, level, match, {
    remap: Object.keys(remap).length ? remap : undefined,
  });
}

export function setRuleAdjust(
  settings: Settings,
  level: RuleLevel,
  match: string,
  key: keyof Adjustments,
  value: number,
): Settings {
  const k = ruleKey(level, match);
  const existing = settings.rules[k];
  const rule: SiteRule = existing ? { ...existing } : { level, match };
  rule.adjust = { ...rule.adjust, [key]: clampAdjustment(key, value) };
  return withRule(settings, k, rule);
}

export function setInheritSubdomains(
  settings: Settings,
  domain: string,
  inherit: boolean,
): Settings {
  const key = ruleKey('domain', domain);
  const existing = settings.rules[key];
  const rule: SiteRule = existing ? { ...existing } : { level: 'domain', match: domain };
  rule.inheritSubdomains = inherit;
  return withRule(settings, key, rule);
}

export function removeRule(settings: Settings, level: RuleLevel, match: string): Settings {
  return { ...settings, rules: omitKey(settings.rules, ruleKey(level, match)) };
}

/** Next mode in the cycle dark, filtered, normal. */
export function nextMode(mode: Mode): Mode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length] as Mode;
}

function withRule(settings: Settings, key: string, rule: SiteRule): Settings {
  const empty =
    rule.mode === undefined &&
    (rule.adjust === undefined || Object.keys(rule.adjust).length === 0) &&
    (rule.inheritSubdomains === undefined || rule.inheritSubdomains === true) &&
    (rule.remap === undefined || Object.keys(rule.remap).length === 0) &&
    !rule.css &&
    rule.integration === undefined;
  const rules = empty ? omitKey(settings.rules, key) : { ...settings.rules, [key]: rule };
  return { ...settings, rules };
}

export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}
