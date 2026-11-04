import { type Settings, automationActive } from '@sdm/settings';

const ID = 'sdm-fallback';
const HOST_RE = /^[a-z0-9.-]+$/i;

function patternsFor(host: string, includeSubdomains: boolean): string[] {
  if (!HOST_RE.test(host)) return [];
  return includeSubdomains ? [`*://${host}/*`, `*://*.${host}/*`] : [`*://${host}/*`];
}

/**
 * Keeps a registered stylesheet that paints the page background dark before first paint
 * (F1a, F10). Sites whose rule is not Dark are excluded; page and pattern rules are handled
 * by the content script setting data-sdm-off, which the fallback selector respects.
 */
export async function syncFallback(settings: Settings, osPrefersDark: boolean): Promise<void> {
  const scripting = browser.scripting;
  if (!scripting?.registerContentScripts) return;
  const active = automationActive(settings, new Date(), osPrefersDark);
  const domainRules = Object.values(settings.rules).filter(
    (r) => r.level === 'domain' || r.level === 'subdomain',
  );

  let matches: string[];
  let excludeMatches: string[] = [];
  if (settings.listMode === 'allowlist') {
    matches = domainRules
      .filter((r) => r.mode === 'dark')
      .flatMap((r) => patternsFor(r.match, r.level === 'domain' && (r.inheritSubdomains ?? true)));
  } else {
    matches = settings.defaultMode === 'dark' ? ['<all_urls>'] : [];
    excludeMatches = domainRules
      .filter((r) => r.mode && r.mode !== 'dark')
      .flatMap((r) => patternsFor(r.match, r.level === 'domain' && (r.inheritSubdomains ?? true)));
  }
  const enabled = settings.enabled && active && matches.length > 0;

  try {
    await scripting.unregisterContentScripts({ ids: [ID] });
  } catch {
    // Not registered yet.
  }
  if (!enabled) return;
  try {
    await scripting.registerContentScripts([
      {
        id: ID,
        matches,
        ...(excludeMatches.length ? { excludeMatches } : {}),
        css: ['fallback.css'],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
  } catch (e) {
    console.warn('fallback registration failed', e);
  }
}
