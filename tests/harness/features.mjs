#!/usr/bin/env node
/**
 * Feature checks in a real browser with the extension loaded: PDF viewer, Deep Integration
 * and its undo journal, native dark detection, colour remapping, custom CSS, page palette
 * and settings sync. Each scenario gets a fresh profile and its own origin
 * (`<name>.localhost`), so per-origin memory cannot leak between them.
 *
 * Usage: node features.mjs   (exit code 1 when any check fails; report in out/features.md)
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const EXTENSION = resolve(here, '../../apps/extension/.output/chrome-mv3');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname.replace(/^\/+/, '');
  try {
    const body = await readFile(join(here, 'fixtures', path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const url = (name, file = `${name}.html`) => `http://${name}.localhost:${port}/${file}`;

const results = [];
const check = (scenario, name, ok, detail = '') => {
  results.push({ scenario, name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${scenario}: ${name}${detail ? ` (${detail})` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function withExtension(fn) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--host-resolver-rules=MAP *.localhost 127.0.0.1',
    ],
  });
  try {
    for (let i = 0; i < 100 && !context.serviceWorkers().length; i++) await wait(100);
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('extension did not load');
    for (let i = 0; i < 50; i++) {
      if (
        await sw.evaluate(async () =>
          Boolean((await chrome.storage.local.get('settings')).settings),
        )
      )
        break;
      await wait(100);
    }
    await wait(800);
    await fn({ context, sw });
  } finally {
    await context.close();
  }
}

/** Reads stored settings, applies `mutator` here in Node, and writes them back. */
async function editSettings(sw, mutator, arg) {
  const { settings } = await sw.evaluate(() => chrome.storage.local.get('settings'));
  const next = mutator(settings, arg);
  await sw.evaluate((value) => chrome.storage.local.set({ settings: value }), next);
}

async function pixel(page, selector) {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(4, 4, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, selector);
}

const rgb = (v) =>
  v
    .match(/\d+(\.\d+)?/g)
    .slice(0, 3)
    .map(Number);
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// --- PDF viewer -----------------------------------------------------------------------------
await withExtension(async ({ context }) => {
  const s = 'PDF viewer';
  const page = await context.newPage();
  await page.goto(url('pdf', 'doc.pdf')).catch(() => {});
  await page.waitForURL(/pdf\.html/, { timeout: 10000 }).catch(() => {});
  check(
    s,
    'navigation to a .pdf opens the built-in viewer',
    page.url().includes('/pdf.html?file='),
    page.url(),
  );
  await page.waitForSelector('.page canvas', { timeout: 15000 }).catch(() => {});
  const px = await pixel(page, '.page canvas');
  check(s, 'page renders with a dark background', px && lum(px) < 0.2, px?.join(','));
  const spans = await page.locator('.textLayer span').count();
  check(s, 'text layer present for selection', spans > 0, `${spans} spans`);
  await page.fill('#query', 'needle');
  await page.press('#query', 'Enter');
  await page.waitForTimeout(800);
  const matches = await page.textContent('#matches');
  check(s, 'search finds both pages', /2/.test(matches ?? ''), matches);
  await page.selectOption('#style', 'sepia');
  await page.waitForTimeout(800);
  const sepia = await pixel(page, '.page canvas');
  check(
    s,
    'sepia style re-renders the page',
    sepia && sepia[0] > 200 && sepia[2] < 230,
    sepia?.join(','),
  );
  await page.click('#original');
  await page.waitForURL(/^http.*doc\.pdf#sdm-original$/, { timeout: 10000 }).catch(() => {});
  check(
    s,
    '"Open original" leaves the viewer for that one load',
    /doc\.pdf#sdm-original$/.test(page.url()),
    page.url(),
  );
});

// --- Deep Integration -----------------------------------------------------------------------
await withExtension(async ({ context, sw }) => {
  const s = 'Deep Integration';
  const page = await context.newPage();
  await page.goto(url('docs', 'integration.html'));
  await page.waitForTimeout(1500);
  const theme = await page.getAttribute('html', 'data-theme');
  check(s, "site's own dark theme switched on (Docusaurus marker)", theme === 'dark', theme);
  const stored = await page.evaluate(() => localStorage.getItem('theme'));
  check(s, 'preference saved on the site', stored === 'dark', stored);
  const converted = await page.evaluate(() =>
    document.documentElement.hasAttribute('data-sdm-off'),
  );
  check(s, 'page is not also converted', converted, '');
  const journal = await sw.evaluate(
    async () => (await chrome.storage.local.get('journal')).journal,
  );
  const entries = Object.values(journal ?? {})[0]?.entries ?? [];
  check(
    s,
    'write recorded in the journal with its previous value',
    entries.length === 1 && entries[0].previous === null,
    JSON.stringify(entries),
  );

  await editSettings(sw, (st) => ({ ...st, integration: 'convert' }));
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => [
    localStorage.getItem('theme'),
    document.documentElement.getAttribute('data-theme'),
  ]);
  check(
    s,
    'switching to "Convert anyway" restores the site storage',
    after[0] === null,
    String(after[0]),
  );
  check(s, 'and the DOM change is undone', after[1] === 'light', after[1]);
  const left = await sw.evaluate(async () => (await chrome.storage.local.get('journal')).journal);
  check(
    s,
    'journal emptied after undo',
    Object.keys(left ?? {}).length === 0,
    JSON.stringify(left),
  );
});

// --- Native dark detection ------------------------------------------------------------------
await withExtension(async ({ context, sw }) => {
  const s = 'Native dark';
  const page = await context.newPage();
  await page.goto(url('dark', 'native-dark.html'));
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => [
    document.documentElement.hasAttribute('data-sdm-off'),
    getComputedStyle(document.body).backgroundColor,
    getComputedStyle(document.querySelector('a')).color,
  ]);
  check(s, 'already-dark page detected and left alone', state[0], '');
  check(
    s,
    'its own colours are kept',
    state[1] === 'rgb(17, 19, 24)' && state[2] === 'rgb(138, 180, 248)',
    `${state[1]} / ${state[2]}`,
  );
  const remembered = await sw.evaluate(async () =>
    Object.keys((await chrome.storage.local.get('native-dark'))['native-dark'] ?? {}),
  );
  check(
    s,
    'origin remembered for the next visit',
    remembered.some((o) => o.includes('dark.localhost')),
    remembered.join(','),
  );
  const second = await context.newPage();
  await second.goto(url('dark', 'native-dark.html'), { waitUntil: 'domcontentloaded' });
  const early = await second.evaluate(() => document.querySelectorAll('style[data-sdm]').length);
  check(s, 'second visit skips conversion from the start', early === 0, `${early} injected styles`);
  const light = await context.newPage();
  await light.goto(url('light', 'basic.html'));
  await light.waitForTimeout(1000);
  const bg = await light.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(s, 'a light page on another origin is still converted', bg !== 'rgb(255, 255, 255)', bg);
});

// --- Colour remap, custom CSS, palette ------------------------------------------------------
await withExtension(async ({ context, sw }) => {
  const s = 'Remap and custom CSS';
  const page = await context.newPage();
  await page.goto(url('brand', 'remap.html'));
  await page.waitForTimeout(1200);
  const status = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://brand.localhost/*' });
    return chrome.tabs.sendMessage(tab.id, { type: 'sdm:status' });
  });
  const hexes = status?.palette?.map((p) => p.hex) ?? [];
  check(
    s,
    'page palette lists the brand colour',
    hexes.includes('#1a73e8'),
    hexes.slice(0, 6).join(' '),
  );

  await editSettings(
    sw,
    (st, host) => ({
      ...st,
      rules: {
        ...st.rules,
        [`domain:${host}`]: {
          level: 'domain',
          match: host,
          remap: { '#1a73e8': '#ff00ff' },
          css: '#a { text-decoration: underline; }\n#b { outline: 2px solid ${#ffffff}; }',
        },
      },
    }),
    'brand.localhost',
  );
  await page.waitForTimeout(1200);
  const styles = await page.evaluate(() => {
    const a = getComputedStyle(document.getElementById('a'));
    const b = getComputedStyle(document.getElementById('b'));
    return {
      color: a.color,
      border: b.borderTopColor,
      deco: a.textDecorationLine,
      outline: b.outlineColor,
    };
  });
  check(s, 'remapped colour used for text', styles.color === 'rgb(255, 0, 255)', styles.color);
  check(
    s,
    'and for every other use of it (border)',
    styles.border === 'rgb(255, 0, 255)',
    styles.border,
  );
  check(s, 'custom CSS applied', styles.deco === 'underline', styles.deco);
  const outline = styles.outline.match(/\d+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
  check(s, '${colour} template converted for dark mode', lum(outline) < 0.4, styles.outline);
});

// --- Sync -----------------------------------------------------------------------------------
await withExtension(async ({ sw }) => {
  const s = 'Sync';
  await editSettings(sw, (st) => ({ ...st, sync: true, defaultMode: 'filtered' }));
  await wait(3500);
  const items = await sw.evaluate(() => chrome.storage.sync.get(null));
  const meta = items['sdm-sync:meta'];
  check(
    s,
    'settings mirrored to storage.sync in chunks',
    meta && meta.chunks >= 1,
    JSON.stringify(meta),
  );
  const json = Array.from({ length: meta?.chunks ?? 0 }, (_, i) => items[`sdm-sync:${i}`]).join('');
  check(
    s,
    'mirrored data matches local settings',
    json.includes('"defaultMode":"filtered"'),
    `${json.length} chars`,
  );
});

// --- Themes, page tools, context menus ------------------------------------------------------
await withExtension(async ({ context, sw }) => {
  const s = 'Themes';
  const page = await context.newPage();
  await page.goto(url('themes', 'basic.html'));
  await page.waitForTimeout(1200);
  const bgOf = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = rgb(await bgOf());
  await editSettings(sw, (st) => ({ ...st, theme: 'amoled' }));
  await page.waitForTimeout(1200);
  const amoled = rgb(await bgOf());
  check(s, 'AMOLED theme makes the page background black', lum(amoled) < 0.01, amoled.join(','));
  check(s, 'and differs from the default dark theme', lum(dark) > lum(amoled), dark.join(','));
  await editSettings(sw, (st) => ({ ...st, theme: 'sepia' }));
  await page.waitForTimeout(1200);
  const sepia = rgb(await bgOf());
  check(s, 'sepia theme tints the background warm', sepia[0] > sepia[2], sepia.join(','));
  await editSettings(sw, (st) => ({
    ...st,
    theme: 'custom:t1',
    customThemes: [
      {
        id: 't1',
        name: 'Navy',
        colors: {
          background: '#101a33',
          text: '#e8e8f0',
          link: '#ffcc00',
          visited: '#cc99ff',
          border: '#2a3555',
          selection: '#334477',
          button: '#1a2747',
          scrollbar: '#2a3555',
        },
      },
    ],
  }));
  await page.waitForTimeout(1200);
  const custom = rgb(await bgOf());
  check(s, 'custom theme colours the background', custom[2] > custom[0] + 10, custom.join(','));
});

await withExtension(async ({ context, sw }) => {
  const s = 'Page tools';
  const page = await context.newPage();
  await page.goto(url('tools', 'bright-shadow.html'));
  await page.waitForTimeout(4500);
  const chip = await page.evaluate(() => document.querySelectorAll('sdm-ui').length);
  check(s, 'self-diagnosis chip shown on a page that stays bright', chip === 1, `${chip} hosts`);

  const tell = (message) =>
    sw.evaluate(async (m) => {
      const [tab] = await chrome.tabs.query({ url: '*://tools.localhost/*' });
      return chrome.tabs.sendMessage(tab.id, m, { frameId: 0 });
    }, message);
  const css = await tell({ type: 'sdm:tool', tool: 'export' });
  check(
    s,
    'generated CSS can be exported',
    typeof css === 'string' && css.length > 200,
    `${css?.length} chars`,
  );
  await tell({ type: 'sdm:tool', tool: 'debug' });
  const status = await tell({ type: 'sdm:status' });
  check(s, 'debug overlay switches on', status?.debug === true, JSON.stringify(status?.debug));
  await page.keyboard.press('Escape');
  const after = await tell({ type: 'sdm:status' });
  check(s, 'and Escape switches it off', after?.debug === false, JSON.stringify(after?.debug));

  await tell({ type: 'sdm:tool', tool: 'picker' });
  const box = await page.locator('#fix-me').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.move(box.x + 20, box.y + 12);
  await page.mouse.click(box.x + 20, box.y + 12);
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const preview = await page.evaluate(
    () => document.getElementById('sdm-picker-preview')?.textContent ?? '',
  );
  check(s, 'picker previews the fix live', preview.includes('#fix-me'), preview.slice(0, 80));
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const { settings } = await sw.evaluate(() => chrome.storage.local.get('settings'));
  const rule = settings.rules['domain:tools.localhost'];
  check(
    s,
    'picker saves the fix as site CSS',
    /#fix-me\s*\{[^}]*background-color/.test(rule?.css ?? ''),
    JSON.stringify(rule?.css ?? null).slice(0, 100),
  );
  const applied = await page.evaluate(
    () => document.getElementById('sdm-custom')?.textContent ?? '',
  );
  check(
    s,
    'saved fix applies to the page, converted',
    /#fix-me\s*\{\s*background-color: rgb/.test(applied),
    applied.slice(0, 80),
  );

  const menus = await sw.evaluate(() => typeof chrome.contextMenus?.update === 'function');
  check(s, 'context menu API available to the extension', menus, '');
});

server.close();
const failed = results.filter((r) => !r.ok);
const md = [
  '| Scenario | Check | Result | Detail |',
  '| --- | --- | --- | --- |',
  ...results.map(
    (r) =>
      `| ${r.scenario} | ${r.name} | ${r.ok ? 'pass' : '**fail**'} | ${r.detail.replace(/\s+/g, ' ').replaceAll('|', '\\|').slice(0, 120)} |`,
  ),
].join('\n');
await mkdir(join(here, 'out'), { recursive: true });
await writeFile(join(here, 'out', 'features.md'), md + '\n');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
