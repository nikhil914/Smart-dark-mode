import {
  type Adjustments,
  type Mode,
  type RuleLevel,
  type Settings,
  type SiteRule,
  MODES,
  clampAdjustment,
  ruleKey,
} from './schema';

/** Pure settings updates used by the popup, shortcuts and context menus. */

export function setRuleMode(
  settings: Settings,
  level: RuleLevel,
  match: string,
  mode: Mode | undefined,
): Settings {
  const key = ruleKey(level, match);
  const existing = settings.rules[key];
  const rule: SiteRule = existing ? { ...existing } : { level, match };
  const rest: SiteRule = { level: rule.level, match: rule.match };
  if (rule.adjust) rest.adjust = rule.adjust;
  if (rule.inheritSubdomains !== undefined) rest.inheritSubdomains = rule.inheritSubdomains;
  return withRule(settings, key, mode ? { ...rest, mode } : rest);
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
    (rule.inheritSubdomains === undefined || rule.inheritSubdomains === true);
  const rules = empty ? omitKey(settings.rules, key) : { ...settings.rules, [key]: rule };
  return { ...settings, rules };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}
