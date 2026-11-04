import { useEffect, useState } from 'preact/hooks';
import {
  type IntegrationChoice,
  type ListMode,
  type Mode,
  type PdfStyle,
  type RuleLevel,
  type Settings,
  type SiteRule,
  ImportError,
  MAX_RULE_CSS,
  MODES,
  PDF_STYLES,
  RULE_LEVELS,
  compilePattern,
  exportSettings,
  importSettings,
  removeRule,
  ruleKey,
  updateRule,
} from '@sdm/settings';
import { type Journal, JOURNAL_KEY, readJournal } from '@/content/integration';
import { clearNativeDark } from '@/content/native-dark';
import { INTEGRATIONS } from '@/data/integrations';
import { t } from '@/lib/i18n';
import { isSettingsChange, loadSettings, saveSettings } from '@/lib/settings-store';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [journal, setJournal] = useState<Journal>({});
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void loadSettings().then(setSettings);
      void readJournal().then(setJournal);
      void browser.storage.local.get('sync-state').then((d) => {
        const error = (d['sync-state'] as { error?: string | null } | undefined)?.error ?? null;
        setSyncError(error);
      });
    };
    load();
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (
        area === 'local' &&
        (isSettingsChange(changes) || JOURNAL_KEY in changes || 'sync-state' in changes)
      )
        load();
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  if (!settings) return <main class="options" aria-busy="true" />;

  const update = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  };

  return (
    <main class="options">
      <h1>{t('optionsTitle')}</h1>
      <General settings={settings} onUpdate={update} syncError={syncError} />
      <Sites settings={settings} onUpdate={update} />
      <Pdf settings={settings} onUpdate={update} />
      <Backup settings={settings} onUpdate={update} />
      <DeepIntegration journal={journal} />
      <About />
    </main>
  );
}

interface Props {
  settings: Settings;
  onUpdate: (s: Settings) => void;
}

function General({ settings, onUpdate, syncError }: Props & { syncError: string | null }) {
  return (
    <section aria-labelledby="general">
      <h2 id="general">{t('sectionGeneral')}</h2>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => onUpdate({ ...settings, enabled: e.currentTarget.checked })}
        />
        {t('enabledEverywhere')}
      </label>
      <div class="field">
        <label for="default-mode">{t('defaultMode')}</label>
        <select
          id="default-mode"
          value={settings.defaultMode}
          onChange={(e) => onUpdate({ ...settings, defaultMode: e.currentTarget.value as Mode })}
        >
          {MODES.map((m) => (
            <option value={m}>{t(`mode_${m}`)}</option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="list-mode">{t('listMode')}</label>
        <select
          id="list-mode"
          value={settings.listMode}
          onChange={(e) => onUpdate({ ...settings, listMode: e.currentTarget.value as ListMode })}
        >
          <option value="blocklist">{t('list_blocklist')}</option>
          <option value="allowlist">{t('list_allowlist')}</option>
        </select>
      </div>
      <p class="hint">{t(`listHint_${settings.listMode}`)}</p>
      <div class="field">
        <label for="integration">{t('integrationDefault')}</label>
        <select
          id="integration"
          value={settings.integration}
          onChange={(e) =>
            onUpdate({ ...settings, integration: e.currentTarget.value as IntegrationChoice })
          }
        >
          <option value="site">{t('integration_site')}</option>
          <option value="convert">{t('integration_convert')}</option>
          <option value="off">{t('integration_off')}</option>
        </select>
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.sync}
          onChange={(e) => onUpdate({ ...settings, sync: e.currentTarget.checked })}
        />
        {t('syncSettings')}
      </label>
      <p class="hint">
        {syncError ? t(`syncError_${syncError.replace(/-/g, '_')}`) : t('syncHint')}
      </p>
    </section>
  );
}

const MODE_OPTIONS: (Mode | '')[] = ['', ...MODES];

function Sites({ settings, onUpdate }: Props) {
  const [level, setLevel] = useState<RuleLevel>('domain');
  const [match, setMatch] = useState('');
  const [mode, setMode] = useState<Mode>('normal');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const rules = Object.entries(settings.rules).sort(([a], [b]) => a.localeCompare(b));

  const add = (e: Event) => {
    e.preventDefault();
    const value = match.trim().toLowerCase();
    if (!value) return;
    if (level === 'pattern' && !compilePattern(value)) {
      setError(t('invalidPattern'));
      return;
    }
    setError('');
    onUpdate(updateRule(settings, level, value, { mode }));
    setMatch('');
  };

  return (
    <section aria-labelledby="sites">
      <h2 id="sites">{t('sectionSites')}</h2>
      <p class="hint">{t('sitesHint')}</p>
      <form class="add-rule" onSubmit={add}>
        <select
          aria-label={t('ruleLevel')}
          value={level}
          onChange={(e) => setLevel(e.currentTarget.value as RuleLevel)}
        >
          {RULE_LEVELS.map((l) => (
            <option value={l}>{t(`level_${l}`)}</option>
          ))}
        </select>
        <input
          aria-label={t('ruleMatch')}
          placeholder={t(`placeholder_${level}`)}
          value={match}
          onInput={(e) => setMatch(e.currentTarget.value)}
        />
        <select
          aria-label={t('modeLabel')}
          value={mode}
          onChange={(e) => setMode(e.currentTarget.value as Mode)}
        >
          {MODES.map((m) => (
            <option value={m}>{t(`mode_${m}`)}</option>
          ))}
        </select>
        <button type="submit">{t('addRule')}</button>
      </form>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {rules.length === 0 ? (
        <p class="hint">{t('noRules')}</p>
      ) : (
        <table class="rules">
          <thead>
            <tr>
              <th scope="col">{t('ruleMatch')}</th>
              <th scope="col">{t('ruleLevel')}</th>
              <th scope="col">{t('modeLabel')}</th>
              <th scope="col">{t('ruleExtras')}</th>
              <th scope="col">
                <span class="visually-hidden">{t('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map(([key, rule]) => (
              <RuleRow
                key={key}
                rule={rule}
                editing={editing === key}
                onEdit={() => setEditing(editing === key ? null : key)}
                settings={settings}
                onUpdate={onUpdate}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RuleRow(props: {
  rule: SiteRule;
  editing: boolean;
  onEdit: () => void;
  settings: Settings;
  onUpdate: (s: Settings) => void;
}) {
  const { rule, editing, onEdit, settings, onUpdate } = props;
  const [css, setCss] = useState(rule.css ?? '');
  const extras = [
    rule.adjust && Object.keys(rule.adjust).length ? t('extra_adjust') : null,
    rule.remap ? t('extra_remap', String(Object.keys(rule.remap).length)) : null,
    rule.css ? t('extra_css') : null,
    rule.integration ? t(`integration_${rule.integration}`) : null,
  ].filter(Boolean);
  const set = (patch: Parameters<typeof updateRule>[3]) =>
    onUpdate(updateRule(settings, rule.level, rule.match, patch));
  return (
    <>
      <tr>
        <td class="match">{rule.match}</td>
        <td>{t(`level_${rule.level}`)}</td>
        <td>
          <select
            aria-label={t('modeFor', rule.match)}
            value={rule.mode ?? ''}
            onChange={(e) =>
              set({ mode: (e.currentTarget.value || undefined) as Mode | undefined })
            }
          >
            {MODE_OPTIONS.map((m) => (
              <option value={m}>{m ? t(`mode_${m}`) : t('mode_inherit')}</option>
            ))}
          </select>
        </td>
        <td>{extras.join(', ')}</td>
        <td class="actions">
          <button type="button" aria-expanded={editing} onClick={onEdit}>
            {t('customCss')}
          </button>
          {rule.remap && (
            <button type="button" onClick={() => set({ remap: undefined })}>
              {t('clearRemap')}
            </button>
          )}
          <button
            type="button"
            class="danger"
            aria-label={t('deleteRuleFor', rule.match)}
            onClick={() => onUpdate(removeRule(settings, rule.level, rule.match))}
          >
            {t('delete')}
          </button>
        </td>
      </tr>
      {editing && (
        <tr class="css-row">
          <td colSpan={5}>
            <label for={`css-${ruleKey(rule.level, rule.match)}`}>
              {t('customCssFor', rule.match)}
            </label>
            <textarea
              id={`css-${ruleKey(rule.level, rule.match)}`}
              spellcheck={false}
              rows={8}
              maxLength={MAX_RULE_CSS}
              value={css}
              onInput={(e) => setCss(e.currentTarget.value)}
            />
            <p class="hint">{t('customCssHint')}</p>
            <button type="button" onClick={() => set({ css: css.trim() || undefined })}>
              {t('save')}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function Pdf({ settings, onUpdate }: Props) {
  const set = (patch: Partial<Settings['pdf']>) =>
    onUpdate({ ...settings, pdf: { ...settings.pdf, ...patch } });
  return (
    <section aria-labelledby="pdf">
      <h2 id="pdf">{t('sectionPdf')}</h2>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.pdf.enabled}
          onChange={(e) => set({ enabled: e.currentTarget.checked })}
        />
        {t('pdfEnabled')}
      </label>
      <div class="field">
        <label for="pdf-style">{t('pdfStyle')}</label>
        <select
          id="pdf-style"
          value={settings.pdf.style}
          onChange={(e) => set({ style: e.currentTarget.value as PdfStyle })}
        >
          {PDF_STYLES.map((s) => (
            <option value={s}>{t(`pdf_${s}`)}</option>
          ))}
        </select>
      </div>
      <p class="hint">{t('pdfHint')}</p>
    </section>
  );
}

function Backup({ settings, onUpdate }: Props) {
  const [message, setMessage] = useState('');

  const doExport = () => {
    const blob = new Blob([exportSettings(settings)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smart-dark-mode-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = importSettings(await file.text());
      if (!window.confirm(t('importConfirm'))) return;
      onUpdate({ ...result.settings, sync: settings.sync });
      const skipped = result.skipped.map((s) => t(`skipped_${s.replace(/-/g, '_')}`)).join(', ');
      setMessage(
        t(`imported_${result.source.replace(/-/g, '_')}`) +
          (skipped ? ` ${t('importSkipped', skipped)}` : ''),
      );
    } catch (err) {
      setMessage(
        t(
          `importError_${(err instanceof ImportError ? err.code : 'unknown-format').replace(/-/g, '_')}`,
        ),
      );
    }
  };

  return (
    <section aria-labelledby="backup">
      <h2 id="backup">{t('sectionBackup')}</h2>
      <p class="hint">{t('backupHint')}</p>
      <div class="buttons">
        <button type="button" onClick={doExport}>
          {t('exportSettings')}
        </button>
        <label class="file-button">
          {t('importSettings')}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void doImport(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {message && (
        <p class="hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function DeepIntegration({ journal }: { journal: Journal }) {
  const [cleared, setCleared] = useState(false);
  const origins = Object.entries(journal).filter(([, j]) => j.entries.length);
  return (
    <section aria-labelledby="integration-log">
      <h2 id="integration-log">{t('sectionIntegration')}</h2>
      <p class="hint">{t('integrationHint')}</p>
      <h3>{t('integrationChanges')}</h3>
      {origins.length === 0 ? (
        <p class="hint">{t('integrationNoChanges')}</p>
      ) : (
        <ul class="journal">
          {origins.map(([origin, j]) => (
            <li>
              <strong>{origin}</strong>
              <ul>
                {j.entries.map((e) => (
                  <li>
                    {t(`journal_${e.kind}`)} <code>{e.key}</code> = <code>{e.value}</code> (
                    {e.previous === null
                      ? t('journalWasUnset')
                      : t('journalWas', e.previous.slice(0, 80))}
                    ), {new Date(e.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p class="hint">{t('integrationUndoHint')}</p>
      <div class="buttons">
        <button type="button" onClick={() => void clearNativeDark().then(() => setCleared(true))}>
          {t('forgetDarkSites')}
        </button>
        {cleared && <span role="status">{t('done')}</span>}
      </div>
      <details>
        <summary>{t('integrationList', String(INTEGRATIONS.length))}</summary>
        <ul class="columns">
          {INTEGRATIONS.map((i) => (
            <li>{i.name}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function About() {
  const version = browser.runtime.getManifest().version;
  return (
    <section aria-labelledby="about">
      <h2 id="about">{t('sectionAbout')}</h2>
      <p>{t('aboutVersion', version)}</p>
      <p class="hint">{t('privacyShort')}</p>
      <p>
        <a href="https://github.com/nikhil914/smart-dark-mode" target="_blank" rel="noreferrer">
          {t('sourceCode')}
        </a>
        {' · '}
        <a
          href="https://github.com/nikhil914/smart-dark-mode/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          {t('reportProblem')}
        </a>
      </p>
    </section>
  );
}
