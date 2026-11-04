import { useEffect, useState } from 'preact/hooks';
import {
  type Adjustments,
  type AutomationKind,
  type Mode,
  type PageLocation,
  type RuleLevel,
  type Settings,
  ADJUSTMENT_LIMITS,
  MODES,
  clampAdjustment,
  pageKey,
  resolve,
  ruleKey,
  setInheritSubdomains,
  setRuleAdjust,
  setRuleMode,
  siteDomain,
  toPageLocation,
} from '@sdm/settings';
import { t } from '@/lib/i18n';
import { isSettingsChange, loadSettings, saveSettings } from '@/lib/settings-store';

type Scope = 'global' | Exclude<RuleLevel, 'pattern'>;

const SLIDERS: (keyof Adjustments)[] = ['brightness', 'contrast', 'saturation', 'warmth', 'dim'];

function scopeMatch(scope: Scope, loc: PageLocation): string {
  if (scope === 'domain') return siteDomain(loc.host);
  if (scope === 'subdomain') return loc.host;
  return pageKey(loc);
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loc, setLoc] = useState<PageLocation | null | undefined>(undefined);
  const [scope, setScope] = useState<Scope>('domain');

  useEffect(() => {
    void loadSettings().then(setSettings);
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setLoc(tab?.url ? toPageLocation(tab.url) : null);
    });
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && isSettingsChange(changes)) void loadSettings().then(setSettings);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  if (!settings || loc === undefined) return <main class="popup" aria-busy="true" />;

  const update = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  };

  if (!loc) {
    return (
      <main class="popup">
        <Header settings={settings} title={t('unsupportedPage')} subtitle="" onUpdate={update} />
        <p class="note">{t('unsupportedPageHint')}</p>
        <Automation settings={settings} onUpdate={update} />
      </main>
    );
  }

  // The configured mode ignores the master switch, list mode and automation.
  const configured = resolve({ ...settings, enabled: true, listMode: 'blocklist' }, loc, {
    automationActive: true,
  });
  const effective = resolve(settings, loc, { automationActive: true });
  const domain = siteDomain(loc.host);
  const domainRule = settings.rules[ruleKey('domain', domain)];
  const inherit = domainRule?.inheritSubdomains ?? true;

  const setMode = (mode: Mode) => {
    if (scope === 'global') return update({ ...settings, defaultMode: mode });
    update(setRuleMode(settings, scope, scopeMatch(scope, loc), mode));
  };

  const setAdjust = (key: keyof Adjustments, value: number) => {
    if (scope === 'global') {
      return update({
        ...settings,
        adjust: { ...settings.adjust, [key]: clampAdjustment(key, value) },
      });
    }
    update(setRuleAdjust(settings, scope, scopeMatch(scope, loc), key, value));
  };

  const rulePath = configured.applied.map((r) => t(`level_${r.level}`)).join(' › ');

  return (
    <main class="popup">
      <Header
        settings={settings}
        title={loc.host}
        subtitle={rulePath ? t('ruleFrom', rulePath) : t('ruleGlobal')}
        onUpdate={update}
      />

      {effective.suppressedBy && (
        <p class="note" role="status">
          {t(`suppressed_${effective.suppressedBy}`)}
        </p>
      )}

      <div class="segmented" role="radiogroup" aria-label={t('modeLabel')}>
        {MODES.map((mode) => (
          <button
            type="button"
            role="radio"
            aria-checked={configured.mode === mode}
            class={configured.mode === mode ? 'selected' : ''}
            onClick={() => setMode(mode)}
          >
            {t(`mode_${mode}`)}
          </button>
        ))}
      </div>

      <div class="row">
        <label for="scope">{t('applyTo')}</label>
        <select id="scope" value={scope} onChange={(e) => setScope(e.currentTarget.value as Scope)}>
          <option value="domain">{t('scope_domain', domain)}</option>
          {loc.host !== domain && (
            <option value="subdomain">{t('scope_subdomain', loc.host)}</option>
          )}
          <option value="page">{t('scope_page')}</option>
          <option value="global">{t('scope_global')}</option>
        </select>
      </div>

      {scope === 'domain' && (
        <label class="check">
          <input
            type="checkbox"
            checked={inherit}
            onChange={(e) =>
              update(setInheritSubdomains(settings, domain, e.currentTarget.checked))
            }
          />
          {t('inheritSubdomains')}
        </label>
      )}

      {configured.mode !== 'normal' && (
        <div class="sliders">
          {SLIDERS.map((key) => {
            const [min, max] = ADJUSTMENT_LIMITS[key];
            const value = scope === 'global' ? settings.adjust[key] : configured.adjust[key];
            return (
              <div class="slider">
                <label for={`adj-${key}`}>{t(`adj_${key}`)}</label>
                <input
                  id={`adj-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  value={value}
                  onInput={(e) => setAdjust(key, Number(e.currentTarget.value))}
                />
                <output for={`adj-${key}`}>{value}</output>
              </div>
            );
          })}
        </div>
      )}

      <Automation settings={settings} onUpdate={update} />
    </main>
  );
}

function Header(props: {
  settings: Settings;
  title: string;
  subtitle: string;
  onUpdate: (s: Settings) => void;
}) {
  const { settings, title, subtitle, onUpdate } = props;
  return (
    <header class="header">
      <div class="site">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button
        type="button"
        class={`power ${settings.enabled ? 'on' : ''}`}
        aria-pressed={settings.enabled}
        aria-label={settings.enabled ? t('turnOffEverywhere') : t('turnOnEverywhere')}
        title={settings.enabled ? t('turnOffEverywhere') : t('turnOnEverywhere')}
        onClick={() => onUpdate({ ...settings, enabled: !settings.enabled })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v9" />
          <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
        </svg>
      </button>
    </header>
  );
}

function Automation(props: { settings: Settings; onUpdate: (s: Settings) => void }) {
  const { settings, onUpdate } = props;
  const { kind, schedule } = settings.automation;
  const set = (patch: Partial<Settings['automation']>) =>
    onUpdate({ ...settings, automation: { ...settings.automation, ...patch } });
  return (
    <fieldset class="automation">
      <legend>{t('automation')}</legend>
      <select
        aria-label={t('automation')}
        value={kind}
        onChange={(e) => set({ kind: e.currentTarget.value as AutomationKind })}
      >
        <option value="off">{t('auto_off')}</option>
        <option value="schedule">{t('auto_schedule')}</option>
        <option value="system">{t('auto_system')}</option>
      </select>
      {kind === 'schedule' && (
        <div class="times">
          <label>
            {t('from')}
            <input
              type="time"
              value={schedule.from}
              onChange={(e) => set({ schedule: { ...schedule, from: e.currentTarget.value } })}
            />
          </label>
          <label>
            {t('to')}
            <input
              type="time"
              value={schedule.to}
              onChange={(e) => set({ schedule: { ...schedule, to: e.currentTarget.value } })}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
