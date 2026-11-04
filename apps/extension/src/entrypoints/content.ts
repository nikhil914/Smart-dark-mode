import { automationActive, nextBoundary, resolve, toPageLocation } from '@sdm/settings';
import { buildCss } from '@/lib/apply-css';
import {
  isOsSchemeChange,
  isSettingsChange,
  loadSettings,
  saveOsPrefersDark,
} from '@/lib/settings-store';

const STYLE_ID = 'sdm-style';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,

  async main() {
    const first = toPageLocation(location.href);
    if (!first) return;
    const initial = first;

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Only the top frame reports the OS scheme, so the background can show the right badge.
    if (window === window.top) void saveOsPrefersDark(scheme.matches);

    async function apply(): Promise<void> {
      const settings = await loadSettings();
      const now = new Date();
      const active = automationActive(settings, now, scheme.matches);
      const current = toPageLocation(location.href) ?? initial;
      const { mode, adjust } = resolve(settings, current, { automationActive: active });
      render(buildCss(mode, adjust));

      clearTimeout(timer);
      if (settings.automation.kind === 'schedule') {
        const { from, to } = settings.automation.schedule;
        const next = nextBoundary(now, from, to);
        if (next) timer = setTimeout(() => void apply(), next.getTime() - now.getTime() + 1000);
      }
    }

    void apply();

    scheme.addEventListener('change', () => {
      if (window === window.top) void saveOsPrefersDark(scheme.matches);
      void apply();
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (isSettingsChange(changes) || isOsSchemeChange(changes)))
        void apply();
    });
    // SPA navigations can move between page-level rules.
    window.addEventListener('popstate', () => void apply());
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) void apply();
    });
  },
});

function render(css: string): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    (document.head ?? document.documentElement).append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
