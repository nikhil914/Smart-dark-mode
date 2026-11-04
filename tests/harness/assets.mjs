#!/usr/bin/env node
/**
 * Renders store and app assets from the built extension and assets/*.svg:
 * - Safari host app icons (iOS single size, macOS sizes)
 * - store screenshots (1280x800): before/after, popup, options, PDF viewer
 * - promo tiles (440x280, 1400x560)
 *
 * Usage: pnpm --filter @sdm/extension build && node assets.mjs
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const EXTENSION = join(root, 'apps/extension/.output/chrome-mv3');
const SHOTS = join(root, 'docs/store/screenshots');
const ICONSET = join(root, 'apps/safari-host/App/Assets.xcassets/AppIcon.appiconset');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
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
const site = (name, file) => `http://${name}.localhost:${port}/${file}`;

await mkdir(SHOTS, { recursive: true });
await mkdir(ICONSET, { recursive: true });

// --- Icons and tiles (no extension needed) --------------------------------------------------
const plain = await chromium.launch();
async function renderHtml(html, width, height, path) {
  const page = await plain.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.screenshot({ path, omitBackground: false });
  await page.close();
}
const square = await readFile(join(root, 'assets/icon-square.svg'), 'utf8');
const rounded = await readFile(join(root, 'assets/icon.svg'), 'utf8');
const svgPage = (svg, size) =>
  `<body style="margin:0"><div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`;

const images = [];
await renderHtml(svgPage(square, 1024), 1024, 1024, join(ICONSET, 'ios-1024.png'));
images.push({ filename: 'ios-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const px = size * scale;
    const file = `mac-${size}@${scale}x.png`;
    // macOS icons keep their own rounded shape and a margin, like other Mac apps.
    const inset = Math.round(px * 0.1);
    const inner = px - inset * 2;
    const html = `<body style="margin:0;background:transparent"><div style="padding:${inset}px">${rounded.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`;
    const page = await plain.newPage({ viewport: { width: px, height: px } });
    await page.setContent(html);
    await page.screenshot({ path: join(ICONSET, file), omitBackground: true });
    await page.close();
    images.push({ filename: file, idiom: 'mac', scale: `${scale}x`, size: `${size}x${size}` });
  }
}
await writeFile(
  join(ICONSET, 'Contents.json'),
  JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n',
);
await writeFile(
  join(dirname(ICONSET), 'Contents.json'),
  JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2) + '\n',
);

const tile = (
  w,
  h,
  big,
) => `<body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;gap:${big ? 48 : 24}px;padding:0 ${big ? 96 : 36}px;box-sizing:border-box;background:linear-gradient(135deg,#17181c,#272a33);font-family:system-ui,sans-serif;color:#ececf1">
  <div style="width:${big ? 220 : 96}px;flex:none">${rounded}</div>
  <div><div style="font-size:${big ? 64 : 30}px;font-weight:700;white-space:nowrap">Smart Dark Mode</div>
  <div style="font-size:${big ? 30 : 14}px;color:#b9bac2;margin-top:8px">Readable dark mode for every site.<br>Free, open source, no tracking.</div></div></body>`;
await renderHtml(tile(440, 280, false), 440, 280, join(SHOTS, 'promo-440x280.png'));
await renderHtml(tile(1400, 560, true), 1400, 560, join(SHOTS, 'promo-1400x560.png'));
await plain.close();

// --- Screenshots with the extension ---------------------------------------------------------
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--host-resolver-rules=MAP *.localhost 127.0.0.1',
  ],
});
for (let i = 0; i < 100 && !context.serviceWorkers().length; i++) await wait(100);
const sw = context.serviceWorkers()[0];
if (!sw) throw new Error('extension did not load');
const extId = new URL(sw.url()).host;
await wait(1500);

async function setSettings(mutator) {
  const { settings } = await sw.evaluate(() => chrome.storage.local.get('settings'));
  await sw.evaluate((value) => chrome.storage.local.set({ settings: value }), mutator(settings));
}

// Before and after, side by side.
const page = await context.newPage();
await setSettings((s) => ({ ...s, enabled: false }));
await page.goto(site('news', 'showcase.html'));
await page.waitForTimeout(1000);
const before = (await page.screenshot()).toString('base64');
await setSettings((s) => ({ ...s, enabled: true }));
await page.waitForTimeout(1500);
const after = (await page.screenshot()).toString('base64');
await page.screenshot({ path: join(SHOTS, '1-dark-page.png') });

const compose = await context.newPage();
await compose.setContent(`<body style="margin:0;width:1280px;height:800px;display:grid;grid-template-columns:1fr 1fr;background:#0d0e11">
  <div style="background:url(data:image/png;base64,${before}) left top/1280px 800px no-repeat;border-right:3px solid #f0a35e"></div>
  <div style="background:url(data:image/png;base64,${after}) left top/1280px 800px no-repeat"></div></body>`);
await compose.screenshot({ path: join(SHOTS, '2-before-after.png') });

// Popup over the converted page. The popup reads the active tab; point it at the article.
const popup = await context.newPage();
await popup.addInitScript(() => {
  if (!location.pathname.endsWith('/popup.html')) return;
  const query = chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query = (q) => (q && q.active ? query({ url: '*://news.localhost/*' }) : query(q));
});
await popup.setViewportSize({ width: 380, height: 640 });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForTimeout(1200);
const height = await popup.evaluate(() => document.documentElement.scrollHeight);
await popup.setViewportSize({ width: 380, height: Math.min(height, 760) });
const popupShot = (await popup.screenshot()).toString('base64');
await compose.setContent(`<body style="margin:0;width:1280px;height:800px;background:url(data:image/png;base64,${after}) left top/1280px 800px">
  <img src="data:image/png;base64,${popupShot}" style="position:absolute;right:24px;top:20px;width:380px;border-radius:12px;box-shadow:0 12px 48px rgb(0 0 0/.6);border:1px solid #3a3b41"></body>`);
await compose.screenshot({ path: join(SHOTS, '3-popup.png') });

// Options page.
const options = await context.newPage();
await options.goto(`chrome-extension://${extId}/options.html`);
await options.waitForTimeout(1000);
await options.screenshot({ path: join(SHOTS, '4-options.png') });

// PDF viewer.
const pdf = await context.newPage();
await pdf.goto(site('pdf', 'doc.pdf')).catch(() => {});
await pdf.waitForURL(/pdf\.html/, { timeout: 10000 }).catch(() => {});
await pdf.waitForSelector('.page canvas', { timeout: 15000 }).catch(() => {});
await pdf.waitForTimeout(800);
await pdf.screenshot({ path: join(SHOTS, '5-pdf-viewer.png') });

await context.close();
server.close();
console.log(`Assets written to ${SHOTS} and ${ICONSET}`);
