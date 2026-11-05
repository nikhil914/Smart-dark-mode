#!/usr/bin/env node
/**
 * Renders store and app assets from the built extension and assets/*.svg:
 * - Safari host app icons (iOS single size, macOS sizes)
 * - store screenshots (1280x800): before/after, popup, options, PDF viewer
 * - promo tiles (440x280, 1400x560) and the 128x128 Chrome Web Store icon
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
  if (path === 'field-guide.pdf') {
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end(showcasePdf());
    return;
  }
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
// Store shots show the host name in the popup, so they use a neutral reserved domain.
const showcase = (file) => `http://fieldnotes.example:${port}/${file}`;

/**
 * A one-page PDF for the viewer screenshot: a heading, body text and a small bar chart.
 * Written by hand so the harness needs no PDF library. Uses the standard 14 fonts.
 */
function showcasePdf() {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = (font, size, x, y, t) => `BT /${font} ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`;
  const body = [
    'Away from city light, the sky changes completely. The Milky Way stops being',
    'a rumour and becomes a bright band of stars you can read a map by. Your eyes',
    'need about twenty minutes to adapt, and one glance at a white screen undoes it.',
  ];
  const bars = [
    ['City centre', 4, '0.89 0.45 0.36'],
    ['Suburb', 7, '0.94 0.64 0.37'],
    ['Rural', 11, '0.55 0.75 0.45'],
    ['Dark-sky reserve', 15, '0.36 0.6 0.85'],
  ];
  const ops = [
    text('F2', 26, 72, 700, 'A field guide to dark skies'),
    '0.45 g',
    text('F1', 11, 72, 678, 'Chapter 3  -  Reading the night'),
    '0.1 g',
    ...body.map((line, i) => text('F1', 12, 72, 640 - i * 18, line)),
    text('F2', 13, 72, 560, 'Visible stars by location (thousands)'),
    ...bars.flatMap(([label, value, rgb], i) => {
      const y = 520 - i * 34;
      return [
        '0.1 g',
        text('F1', 11, 72, y + 6, label),
        `${rgb} rg 190 ${y} ${value * 22} 20 re f`,
        '0.1 g',
        text('F1', 11, 198 + value * 22, y + 6, String(value)),
      ];
    }),
    '0.1 g',
    text(
      'F1',
      12,
      72,
      340,
      'Tip: switch every screen to dark mode before you step outside, and keep',
    ),
    text('F1', 12, 72, 322, 'the brightness low. Red light preserves your night vision best.'),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((obj, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

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
// Chrome Web Store icon: 96x96 artwork centred on a transparent 128x128 canvas.
{
  const page = await plain.newPage({ viewport: { width: 128, height: 128 } });
  await page.setContent(
    `<body style="margin:0;background:transparent"><div style="padding:16px">${rounded.replace('<svg ', '<svg width="96" height="96" ')}</div></body>`,
  );
  await page.screenshot({ path: join(SHOTS, 'store-icon-128.png'), omitBackground: true });
  await page.close();
}
await renderHtml(tile(1400, 560, true), 1400, 560, join(SHOTS, 'promo-1400x560.png'));
await plain.close();

// --- Screenshots with the extension ---------------------------------------------------------
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--host-resolver-rules=MAP *.localhost 127.0.0.1, MAP fieldnotes.example 127.0.0.1',
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
await page.goto(showcase('showcase.html'));
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
  chrome.tabs.query = (q) =>
    q && q.active ? query({ url: '*://fieldnotes.example/*' }) : query(q);
});
await popup.setViewportSize({ width: 380, height: 640 });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForTimeout(1200);
const height = await popup.evaluate(() => document.documentElement.scrollHeight);
await popup.setViewportSize({ width: 380, height });
const popupShot = (await popup.screenshot()).toString('base64');
// Show the whole popup; scale it down when it is taller than the screenshot.
const shown = Math.min(1, 760 / height);
await compose.setContent(`<body style="margin:0;width:1280px;height:800px;background:url(data:image/png;base64,${after}) left top/1280px 800px">
  <img src="data:image/png;base64,${popupShot}" style="position:absolute;right:24px;top:20px;width:${Math.round(380 * shown)}px;border-radius:12px;box-shadow:0 12px 48px rgb(0 0 0/.6);border:1px solid #3a3b41"></body>`);
await compose.screenshot({ path: join(SHOTS, '3-popup.png') });

// Options page.
const options = await context.newPage();
await options.goto(`chrome-extension://${extId}/options.html`);
await options.waitForTimeout(1000);
await options.screenshot({ path: join(SHOTS, '4-options.png') });

// PDF viewer.
const pdf = await context.newPage();
await pdf.goto(showcase('field-guide.pdf')).catch(() => {});
await pdf.waitForURL(/pdf\.html/, { timeout: 10000 }).catch(() => {});
await pdf.waitForSelector('.page canvas', { timeout: 15000 }).catch(() => {});
await pdf.waitForTimeout(800);
await pdf.screenshot({ path: join(SHOTS, '5-pdf-viewer.png') });

await context.close();
server.close();
console.log(`Assets written to ${SHOTS} and ${ICONSET}`);
