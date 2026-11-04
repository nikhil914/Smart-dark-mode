/**
 * Deep Integration list: sites and site generators that ship their own dark theme, and
 * how to switch it on. Data only. P4 moves this list into the signed fixes bundle so it
 * can be updated without a release.
 *
 * Prefer DOM actions (attributes, classes): they last for one page view and vanish on
 * their own. Storage and cookie writes persist on the site, so they are journaled and
 * undone when the user turns the integration off (see content/integration.ts).
 */

export type Target = 'html' | 'body';

export type IntegrationAction =
  | { type: 'attr'; target: Target; name: string; value: string }
  | { type: 'class'; target: Target; add?: string[]; remove?: string[] }
  | { type: 'localStorage'; key: string; value: string }
  | { type: 'cookie'; name: string; value: string; days: number };

export interface Integration {
  id: string;
  name: string;
  /** Hostnames; a host matches itself and its subdomains. */
  hosts?: string[];
  /** Selector that identifies a site generator, checked once the DOM is parsed. */
  marker?: string;
  /** Selector that matches while the site's own dark theme is on. */
  active?: string;
  actions: IntegrationAction[];
  /** The site only reads its stored preference while loading: reload once after writing it. */
  reload?: boolean;
}

const attr = (target: Target, name: string, value: string): IntegrationAction => ({
  type: 'attr',
  target,
  name,
  value,
});
const cls = (target: Target, add: string[], remove: string[] = []): IntegrationAction => ({
  type: 'class',
  target,
  add,
  remove,
});
const ls = (key: string, value: string): IntegrationAction => ({
  type: 'localStorage',
  key,
  value,
});

export const INTEGRATIONS: readonly Integration[] = [
  // Specific sites.
  {
    id: 'github',
    name: 'GitHub',
    hosts: ['github.com'],
    active: 'html[data-color-mode="dark"]',
    actions: [attr('html', 'data-color-mode', 'dark'), attr('html', 'data-dark-theme', 'dark')],
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    hosts: ['duckduckgo.com'],
    actions: [{ type: 'cookie', name: 'ae', value: 'd', days: 365 }],
    reload: true,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    hosts: ['youtube.com'],
    active: 'html[dark]',
    actions: [attr('html', 'dark', '')],
  },
  {
    id: 'wikimedia',
    name: 'Wikipedia and sister projects',
    hosts: [
      'wikipedia.org',
      'wiktionary.org',
      'wikimedia.org',
      'mediawiki.org',
      'wikiquote.org',
      'wikibooks.org',
      'wikivoyage.org',
      'wikinews.org',
      'wikisource.org',
      'wikiversity.org',
    ],
    active: 'html.skin-theme-clientpref-night',
    actions: [
      cls(
        'html',
        ['skin-theme-clientpref-night'],
        ['skin-theme-clientpref-day', 'skin-theme-clientpref-os'],
      ),
    ],
  },
  {
    id: 'stackexchange',
    name: 'Stack Overflow and Stack Exchange',
    hosts: [
      'stackoverflow.com',
      'superuser.com',
      'serverfault.com',
      'askubuntu.com',
      'stackexchange.com',
      'mathoverflow.net',
      'stackapps.com',
    ],
    active: 'body.theme-dark',
    actions: [cls('body', ['theme-dark'], ['theme-system'])],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    hosts: ['reddit.com'],
    active: 'html.theme-dark',
    actions: [cls('html', ['theme-dark'], ['theme-light'])],
  },
  {
    id: 'mdn',
    name: 'MDN Web Docs',
    hosts: ['developer.mozilla.org'],
    active: 'html.dark',
    actions: [cls('html', ['dark'], ['light'])],
  },
  {
    id: 'docs-rs',
    name: 'docs.rs',
    hosts: ['docs.rs'],
    marker: 'meta[name="generator"][content="rustdoc"]',
    active: 'html[data-theme="dark"]',
    actions: [
      attr('html', 'data-theme', 'dark'),
      ls('rustdoc-theme', 'dark'),
      ls('rustdoc-use-system-theme', 'false'),
    ],
    reload: true,
  },
  {
    id: 'go-dev',
    name: 'Go packages',
    hosts: ['pkg.go.dev', 'go.dev'],
    active: 'html[data-theme="dark"]',
    actions: [attr('html', 'data-theme', 'dark')],
  },
  {
    id: 'ms-learn',
    name: 'Microsoft Learn',
    hosts: ['learn.microsoft.com'],
    active: 'html.theme-dark',
    actions: [cls('html', ['theme-dark'], ['theme-light'])],
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    hosts: ['tailwindcss.com'],
    active: 'html.dark',
    actions: [cls('html', ['dark'], ['light']), ls('theme', 'dark')],
  },
  {
    id: 'react',
    name: 'React',
    hosts: ['react.dev'],
    active: 'html.dark',
    actions: [cls('html', ['dark'], ['light']), ls('theme', 'dark')],
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    hosts: ['nextjs.org'],
    active: 'html.dark',
    actions: [cls('html', ['dark'], ['light']), ls('theme', 'dark')],
  },
  {
    id: 'mui',
    name: 'MUI',
    hosts: ['mui.com'],
    active: 'html[data-mui-color-scheme="dark"]',
    actions: [attr('html', 'data-mui-color-scheme', 'dark'), ls('mui-mode', 'dark')],
  },
  {
    id: 'bootstrap-docs',
    name: 'Bootstrap',
    hosts: ['getbootstrap.com'],
    active: 'html[data-bs-theme="dark"]',
    actions: [attr('html', 'data-bs-theme', 'dark'), ls('theme', 'dark')],
  },

  // Site generators and design systems, recognised from the page itself.
  {
    id: 'docusaurus',
    name: 'Docusaurus site',
    marker: 'meta[name="generator"][content^="Docusaurus"]',
    active: 'html[data-theme="dark"]',
    actions: [attr('html', 'data-theme', 'dark'), ls('theme', 'dark')],
  },
  {
    id: 'vitepress',
    name: 'VitePress site',
    marker: 'meta[name="generator"][content^="VitePress"]',
    active: 'html.dark',
    actions: [cls('html', ['dark']), ls('vitepress-theme-appearance', 'dark')],
  },
  {
    id: 'starlight',
    name: 'Starlight site',
    marker: 'meta[name="generator"][content^="Starlight"]',
    active: 'html[data-theme="dark"]',
    actions: [attr('html', 'data-theme', 'dark'), ls('starlight-theme', 'dark')],
  },
  {
    id: 'mkdocs-material',
    name: 'Material for MkDocs site',
    marker: 'body[data-md-color-scheme]',
    active: 'body[data-md-color-scheme="slate"]',
    actions: [attr('body', 'data-md-color-scheme', 'slate')],
  },
  {
    id: 'mdbook',
    name: 'mdBook site',
    marker: '#theme-list .theme, #mdbook-theme-list',
    active: 'html.navy, html.coal, html.ayu',
    actions: [cls('html', ['navy'], ['light', 'rust']), ls('mdbook-theme', '"navy"')],
  },
  {
    id: 'furo',
    name: 'Sphinx (Furo) site',
    marker: 'body[data-theme] .theme-toggle',
    active: 'body[data-theme="dark"]',
    actions: [attr('body', 'data-theme', 'dark'), ls('theme', 'dark')],
  },
  {
    id: 'primer',
    name: 'Site built with GitHub Primer',
    marker: 'html[data-color-mode]',
    active: 'html[data-color-mode="dark"]',
    actions: [attr('html', 'data-color-mode', 'dark'), attr('html', 'data-dark-theme', 'dark')],
  },
  {
    id: 'bootstrap',
    name: 'Site built with Bootstrap 5.3',
    marker: 'html[data-bs-theme]',
    active: 'html[data-bs-theme="dark"]',
    actions: [attr('html', 'data-bs-theme', 'dark')],
  },
];

export function integrationForHost(host: string): Integration | null {
  for (const integration of INTEGRATIONS) {
    if (integration.hosts?.some((h) => host === h || host.endsWith(`.${h}`))) return integration;
  }
  return null;
}

/** Generator-based integrations need the parsed DOM. */
export function integrationForDocument(doc: Document): Integration | null {
  for (const integration of INTEGRATIONS) {
    if (!integration.hosts && integration.marker && doc.querySelector(integration.marker)) {
      return integration;
    }
  }
  return null;
}
