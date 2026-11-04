import { themeFrom, themeKey } from '@sdm/engine';
import { automationActive, nextBoundary, resolve, toPageLocation } from '@sdm/settings';
import { filteredCss, overlayCss } from '@/lib/apply-css';
import {
  isOsSchemeChange,
  isSettingsChange,
  loadSettings,
  saveOsPrefersDark,
} from '@/lib/settings-store';
import { readCache, writeCache } from '@/content/cache';
import { DynamicTheme } from '@/content/dynamic-theme';
import { ImageClassifier } from '@/content/images';

const STYLE_ID = 'sdm-style';
const CACHE_ID = 'sdm-cache';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,

  async main() {
    const first = toPageLocation(location.href);
    if (!first) return;
    const initial = first;
    const html = document.documentElement;
    const isTop = window === window.top;
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let engine: DynamicTheme | null = null;
    let images: ImageClassifier | null = null;
    let currentThemeKey = '';
    let cacheTimer: ReturnType<typeof setTimeout> | undefined;

    if (isTop) void saveOsPrefersDark(scheme.matches);

    function markReady(): void {
      const set = () => html.setAttribute('data-sdm-ready', '');
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(set), {
          once: true,
        });
      } else set();
    }

    function stopEngine(): void {
      engine?.stop();
      engine = null;
      images?.stop();
      images = null;
      document.getElementById(CACHE_ID)?.remove();
    }

    async function apply(): Promise<void> {
      const settings = await loadSettings();
      const now = new Date();
      const active = automationActive(settings, now, scheme.matches);
      const loc = toPageLocation(location.href) ?? initial;
      const { mode, adjust } = resolve(settings, loc, { automationActive: active });

      if (mode === 'dark') {
        html.removeAttribute('data-sdm-off');
        const theme = themeFrom(adjust);
        const key = themeKey(theme);
        render(STYLE_ID, overlayCss(adjust));
        if (!engine) {
          currentThemeKey = key;
          const cached = await readCache(location.origin, key);
          if (cached && !engine) render(CACHE_ID, cached);
          engine = new DynamicTheme(theme, {
            onRendered: (css) => {
              markReady();
              document.getElementById(CACHE_ID)?.remove();
              if (isTop && location.origin !== 'null') {
                clearTimeout(cacheTimer);
                cacheTimer = setTimeout(
                  () => void writeCache(location.origin, currentThemeKey, css),
                  3000,
                );
              }
            },
          });
          engine.start();
          images = new ImageClassifier();
          const watchImages = () => images?.observe(document);
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', watchImages, { once: true });
          } else watchImages();
          window.addEventListener('load', watchImages, { once: true });
        } else if (key !== currentThemeKey) {
          currentThemeKey = key;
          engine.setTheme(theme);
        }
      } else {
        html.setAttribute('data-sdm-off', '');
        stopEngine();
        render(STYLE_ID, mode === 'filtered' ? filteredCss(adjust) : '');
      }

      clearTimeout(timer);
      if (settings.automation.kind === 'schedule') {
        const { from, to } = settings.automation.schedule;
        const next = nextBoundary(now, from, to);
        if (next) timer = setTimeout(() => void apply(), next.getTime() - now.getTime() + 1000);
      }
    }

    void apply();

    scheme.addEventListener('change', () => {
      if (isTop) void saveOsPrefersDark(scheme.matches);
      void apply();
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (isSettingsChange(changes) || isOsSchemeChange(changes)))
        void apply();
    });
    // SPA navigations can move between page-level rules.
    window.addEventListener('popstate', () => void apply());
    window.addEventListener('__sdm:navigate', () => void apply());
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) void apply();
    });
  },
});

function render(id: string, css: string): void {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-sdm', id);
  }
  if (style.textContent !== css) style.textContent = css;
  const parent = document.head ?? document.documentElement;
  if (style.parentNode !== parent) parent.append(style);
}
