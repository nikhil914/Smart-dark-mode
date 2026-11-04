import { type Theme, expandTemplates, themeFrom, themeKey } from '@sdm/engine';
import { automationActive, nextBoundary, resolve, toPageLocation } from '@sdm/settings';
import { filteredCss, overlayCss } from '@/lib/apply-css';
import type { PageStatus } from '@/lib/messages';
import {
  isOsSchemeChange,
  isSettingsChange,
  loadSettings,
  saveOsPrefersDark,
} from '@/lib/settings-store';
import { readCache, writeCache } from '@/content/cache';
import { DynamicTheme } from '@/content/dynamic-theme';
import { ImageClassifier } from '@/content/images';
import { IntegrationController, pageLooksDark, readJournal } from '@/content/integration';
import { forgetNativeDark, isNativeDark, rememberNativeDark } from '@/content/native-dark';
import { type Integration, integrationForDocument, integrationForHost } from '@/data/integrations';

const STYLE_ID = 'sdm-style';
const CACHE_ID = 'sdm-cache';
const CUSTOM_ID = 'sdm-custom';

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
    const origin = location.origin;
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let engine: DynamicTheme | null = null;
    let images: ImageClassifier | null = null;
    let currentThemeKey = '';
    let cacheTimer: ReturnType<typeof setTimeout> | undefined;
    const integration = isTop && origin !== 'null' ? new IntegrationController(origin) : null;
    /** A site generator recognised from the DOM (Docusaurus, VitePress...). */
    let markerIntegration: Integration | null = null;
    let nativeDark = false;
    let detectionScheduled = false;

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

    function leaveAlone(): void {
      html.setAttribute('data-sdm-off', '');
      stopEngine();
    }

    function startEngine(theme: Theme): void {
      const key = themeKey(theme);
      if (engine) {
        if (key !== currentThemeKey) {
          currentThemeKey = key;
          engine.setTheme(theme);
        }
        return;
      }
      currentThemeKey = key;
      void readCache(origin, key).then((cached) => {
        if (cached && engine && !html.hasAttribute('data-sdm-ready')) render(CACHE_ID, cached);
      });
      engine = new DynamicTheme(theme, {
        onRendered: (css) => {
          markReady();
          document.getElementById(CACHE_ID)?.remove();
          if (isTop && origin !== 'null') {
            clearTimeout(cacheTimer);
            cacheTimer = setTimeout(() => void writeCache(origin, currentThemeKey, css), 3000);
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
    }

    /**
     * After load, checks whether the page has a dark theme of its own. Our styles are
     * switched off for the duration of one synchronous check, so no frame shows the
     * page without them.
     */
    function scheduleDetection(): void {
      if (detectionScheduled || !isTop) return;
      detectionScheduled = true;
      const onParsed = () => {
        const found = integrationForDocument(document);
        if (found) {
          markerIntegration = found;
          void apply();
        }
      };
      const onLoad = () => {
        if (markerIntegration) return;
        if (nativeDark) {
          // Remembered as dark: confirm the site still is (its theme may follow a setting).
          if (!pageLooksDark()) {
            nativeDark = false;
            void forgetNativeDark(origin).then(apply);
          }
          return;
        }
        if (!engine) return;
        engine.setSuspended(true);
        const hadOff = html.hasAttribute('data-sdm-off');
        html.setAttribute('data-sdm-off', '');
        const dark = pageLooksDark();
        if (!hadOff) html.removeAttribute('data-sdm-off');
        engine.setSuspended(false);
        if (dark) {
          nativeDark = true;
          void rememberNativeDark(origin).then(apply);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onParsed, { once: true });
      } else onParsed();
      if (document.readyState === 'complete') setTimeout(onLoad, 0);
      else window.addEventListener('load', () => setTimeout(onLoad, 0), { once: true });
    }

    async function apply(): Promise<void> {
      const settings = await loadSettings();
      const now = new Date();
      const active = automationActive(settings, now, scheme.matches);
      const loc = toPageLocation(location.href) ?? initial;
      const r = resolve(settings, loc, { automationActive: active });
      const { mode, adjust } = r;

      if (
        isTop &&
        settings.pdf.enabled &&
        document.contentType === 'application/pdf' &&
        !location.hash.includes('sdm-original')
      ) {
        const viewer = browser.runtime.getURL('/pdf.html');
        location.replace(`${viewer}?file=${encodeURIComponent(location.href)}`);
        return;
      }

      if (isTop && !nativeDark && mode === 'dark' && r.integration === 'site') {
        nativeDark = await isNativeDark(origin);
      }
      const siteTheme =
        integration && mode === 'dark' && r.integration === 'site'
          ? (integrationForHost(loc.host) ?? markerIntegration)
          : null;

      // Undo a site theme we switched on earlier, once it is no longer wanted.
      if (integration && !siteTheme && (integration.active || (await hasJournal()))) {
        const reload = integration.active?.reload ?? false;
        const changed = await integration.disable();
        if (changed && reload) {
          location.reload();
          return;
        }
      }

      let theme: Theme | null = null;
      if (mode === 'dark' && r.integration === 'off') {
        leaveAlone();
        render(STYLE_ID, '');
      } else if (siteTheme) {
        leaveAlone();
        render(STYLE_ID, overlayCss(adjust));
        if (integration && integration.active?.id !== siteTheme.id) {
          if (await integration.enable(siteTheme)) location.reload();
        }
      } else if (mode === 'dark' && nativeDark && r.integration === 'site') {
        leaveAlone();
        render(STYLE_ID, overlayCss(adjust));
        scheduleDetection();
      } else if (mode === 'dark') {
        html.removeAttribute('data-sdm-off');
        theme = themeFrom(adjust, 'balanced', r.remap);
        render(STYLE_ID, overlayCss(adjust));
        startEngine(theme);
        if (r.integration === 'site') scheduleDetection();
      } else {
        leaveAlone();
        render(STYLE_ID, mode === 'filtered' ? filteredCss(adjust) : '');
      }

      render(CUSTOM_ID, mode === 'normal' ? '' : expandTemplates(r.css, theme));

      clearTimeout(timer);
      if (settings.automation.kind === 'schedule') {
        const { from, to } = settings.automation.schedule;
        const next = nextBoundary(now, from, to);
        if (next) timer = setTimeout(() => void apply(), next.getTime() - now.getTime() + 1000);
      }
    }

    async function hasJournal(): Promise<boolean> {
      return Boolean((await readJournal())[origin]?.entries.length);
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

    if (isTop) {
      browser.runtime.onMessage.addListener((message: unknown) => {
        if ((message as { type?: unknown } | null)?.type !== 'sdm:status') return undefined;
        const status: PageStatus = {
          siteTheme: integration?.active?.name ?? null,
          nativeDark,
          palette: engine?.palette() ?? [],
        };
        return Promise.resolve(status);
      });
    }
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
