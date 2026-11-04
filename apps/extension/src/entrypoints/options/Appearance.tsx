import { useEffect, useState } from 'preact/hooks';
import {
  type CustomTheme,
  type CustomThemeColors,
  type SaturationPreset,
  type Settings,
  type ThemeId,
  BUILT_IN_THEME_IDS,
  CUSTOM_THEME_KEYS,
  MAX_CUSTOM_THEMES,
  SATURATION_PRESETS,
  defaultCustomColors,
  parseThemeShareCode,
  themeShareCode,
} from '@sdm/settings';
import { t } from '@/lib/i18n';
import type { FixesUpdateRequest } from '@/lib/messages';

interface Props {
  settings: Settings;
  onUpdate: (s: Settings) => void;
}

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function Appearance({ settings, onUpdate }: Props) {
  const set = (patch: Partial<Settings>) => onUpdate({ ...settings, ...patch });
  const setImages = (patch: Partial<Settings['images']>) =>
    set({ images: { ...settings.images, ...patch } });
  return (
    <section aria-labelledby="appearance">
      <h2 id="appearance">{t('sectionAppearance')}</h2>
      <div class="field">
        <label for="theme">{t('themeLabel')}</label>
        <select
          id="theme"
          value={settings.theme}
          onChange={(e) => set({ theme: e.currentTarget.value as ThemeId })}
        >
          {BUILT_IN_THEME_IDS.map((id) => (
            <option value={id}>{t(`theme_${id}`)}</option>
          ))}
          {settings.customThemes.map((c) => (
            <option value={`custom:${c.id}`}>{c.name}</option>
          ))}
        </select>
      </div>
      <p class="hint">
        {t(`themeHint_${settings.theme.startsWith('custom:') ? 'custom' : settings.theme}`)}
      </p>
      <div class="field">
        <label for="preset">{t('presetLabel')}</label>
        <select
          id="preset"
          value={settings.preset}
          onChange={(e) => set({ preset: e.currentTarget.value as SaturationPreset })}
        >
          {SATURATION_PRESETS.map((p) => (
            <option value={p}>{t(`preset_${p}`)}</option>
          ))}
        </select>
      </div>

      <h3>{t('imagesHeading')}</h3>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.images.hoverOriginal}
          onChange={(e) => setImages({ hoverOriginal: e.currentTarget.checked })}
        />
        {t('imagesHoverOriginal')}
      </label>
      <div class="field">
        <label for="photo-dim">{t('imagesPhotoDim')}</label>
        <input
          id="photo-dim"
          type="range"
          min={0}
          max={40}
          value={settings.images.photoDim}
          onInput={(e) => setImages({ photoDim: Number(e.currentTarget.value) })}
        />
        <output for="photo-dim">{settings.images.photoDim}%</output>
      </div>

      <h3>{t('diagnosisHeading')}</h3>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.diagnosis}
          onChange={(e) => set({ diagnosis: e.currentTarget.checked })}
        />
        {t('diagnosisEnabled')}
      </label>
      <p class="hint">{t('diagnosisHint')}</p>

      <CustomThemes settings={settings} onUpdate={onUpdate} />
    </section>
  );
}

function CustomThemes({ settings, onUpdate }: Props) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const themes = settings.customThemes;
  const full = themes.length >= MAX_CUSTOM_THEMES;

  const save = (next: CustomTheme[], theme: ThemeId = settings.theme) =>
    onUpdate({ ...settings, customThemes: next, theme });

  const add = (theme: CustomTheme) => {
    if (full) return;
    save([...themes, theme], `custom:${theme.id}`);
  };

  const importCode = () => {
    const parsed = parseThemeShareCode(code, newId());
    if (!parsed) {
      setMessage(t('themeCodeInvalid'));
      return;
    }
    add(parsed);
    setCode('');
    setMessage(t('themeCodeImported', parsed.name));
  };

  return (
    <>
      <h3>{t('customThemesHeading')}</h3>
      {themes.map((theme) => (
        <ThemeEditor
          key={theme.id}
          theme={theme}
          onChange={(next) => save(themes.map((c) => (c.id === theme.id ? next : c)))}
          onRemove={() =>
            save(
              themes.filter((c) => c.id !== theme.id),
              settings.theme === `custom:${theme.id}` ? 'dark' : settings.theme,
            )
          }
        />
      ))}
      <div class="row">
        <button
          type="button"
          disabled={full}
          onClick={() =>
            add({ id: newId(), name: t('customThemeDefaultName'), colors: defaultCustomColors() })
          }
        >
          {t('customThemeAdd')}
        </button>
      </div>
      <div class="field">
        <label for="theme-code">{t('themeCodeLabel')}</label>
        <input
          id="theme-code"
          type="text"
          value={code}
          placeholder="sdm-theme:..."
          onInput={(e) => setCode(e.currentTarget.value)}
        />
        <button type="button" disabled={!code.trim() || full} onClick={importCode}>
          {t('themeCodeImport')}
        </button>
      </div>
      {message && (
        <p class="hint" role="status">
          {message}
        </p>
      )}
    </>
  );
}

function ThemeEditor(props: {
  theme: CustomTheme;
  onChange: (t: CustomTheme) => void;
  onRemove: () => void;
}) {
  const { theme, onChange, onRemove } = props;
  const [copied, setCopied] = useState(false);
  const setColor = (key: keyof CustomThemeColors, value: string) =>
    onChange({ ...theme, colors: { ...theme.colors, [key]: value } });
  const copy = () => {
    void navigator.clipboard.writeText(themeShareCode(theme)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <fieldset class="theme-editor">
      <legend>
        <input
          type="text"
          aria-label={t('customThemeName')}
          value={theme.name}
          maxLength={40}
          onChange={(e) => onChange({ ...theme, name: e.currentTarget.value.trim() || theme.name })}
        />
      </legend>
      <div class="swatches">
        {CUSTOM_THEME_KEYS.map((key) => (
          <label class="swatch">
            <input
              type="color"
              value={theme.colors[key]}
              onChange={(e) => setColor(key, e.currentTarget.value)}
            />
            {t(`customColor_${key}`)}
          </label>
        ))}
      </div>
      <div
        class="theme-preview"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          borderColor: theme.colors.border,
        }}
      >
        {t('customThemePreview')}{' '}
        <span style={{ color: theme.colors.link, textDecoration: 'underline' }}>
          {t('customColor_link')}
        </span>{' '}
        <span style={{ color: theme.colors.visited, textDecoration: 'underline' }}>
          {t('customColor_visited')}
        </span>{' '}
        <span style={{ background: theme.colors.selection }}>{t('customColor_selection')}</span>{' '}
        <span class="preview-button" style={{ background: theme.colors.button }}>
          {t('customColor_button')}
        </span>
      </div>
      <div class="row">
        <button type="button" onClick={copy}>
          {copied ? t('copied') : t('themeCodeCopy')}
        </button>
        <button type="button" class="danger" onClick={onRemove}>
          {t('remove')}
        </button>
      </div>
    </fieldset>
  );
}

interface FixesState {
  status: 'updated' | 'unchanged' | 'disabled' | 'rejected' | 'failed';
  checkedAt: number;
  version: number | null;
}

export function SiteFixes({ settings, onUpdate }: Props) {
  const [state, setState] = useState<FixesState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () =>
      void browser.storage.local
        .get('fixes-status')
        .then((d) => setState((d['fixes-status'] as FixesState | undefined) ?? null));
    load();
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'fixes-status' in changes) load();
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  const check = () => {
    setBusy(true);
    const request: FixesUpdateRequest = { type: 'sdm:fixes-update' };
    void browser.runtime
      .sendMessage(request)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <section aria-labelledby="fixes">
      <h2 id="fixes">{t('sectionFixes')}</h2>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.fixesUpdates}
          onChange={(e) => onUpdate({ ...settings, fixesUpdates: e.currentTarget.checked })}
        />
        {t('fixesUpdates')}
      </label>
      <p class="hint">{t('fixesHint')}</p>
      <p class="hint" role="status">
        {state
          ? t(`fixesStatus_${state.status}`, [
              new Date(state.checkedAt).toLocaleString(),
              String(state.version ?? '-'),
            ])
          : t('fixesNeverChecked')}
      </p>
      <button type="button" disabled={busy || !settings.fixesUpdates} onClick={check}>
        {t('fixesCheckNow')}
      </button>
    </section>
  );
}
