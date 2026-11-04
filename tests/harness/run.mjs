#!/usr/bin/env node
/**
 * Quality harness. Loads each page three times (no extension, this extension, Dark Reader's
 * npm build injected at document start) and measures:
 *
 *   flash     frames that are mostly white while the page loads (CPU throttled 4x)
 *   bright    share of bright pixels in the viewport, 1 s and 8 s after load
 *   contrast  share of visible text elements reaching WCAG AA (4.5:1), shadow DOM included
 *   perf      Chrome's task, script, style recalc and layout time for the load
 *   images    the dark icon is visible and the photo keeps its colours (images fixture)
 *   security  requests the extension or Dark Reader made to a local server (security fixture)
 *
 * Usage:
 *   node run.mjs                         local fixtures
 *   node run.mjs --corpus corpus.txt     real sites (needs internet)
 *   node run.mjs --only basic,css-vars   subset of fixtures
 *   node run.mjs --modes ours,none       subset of modes
 *
 * Results go to out/results.json and out/report.md (out/corpus-*.json|md for --corpus).
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const require = createRequire(import.meta.url);

const args = parseArgs(process.argv.slice(2));
const EXTENSION = resolve(root, args.extension ?? 'apps/extension/.output/chrome-mv3');
const MODES = (args.modes ?? 'none,ours,darkreader').split(',');
const SETTLE_LATE_MS = Number(args.late ?? 8000);
const VIEWPORT = { width: 1280, height: 800 };

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[++i];
  }
  return out;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.js': 'text/javascript',
};

/** Serves the fixtures; `PORT2` in a fixture is replaced with the trap server's port. */
function fixtureServer(trapPort) {
  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html';
    try {
      let body = await readFile(join(here, 'fixtures', path));
      if (path.endsWith('.html'))
        body = Buffer.from(String(body).replaceAll('PORT2', String(trapPort)));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

/** Records every request. Stylesheet <link> loads carry no Origin header; fetch() calls do. */
function trapServer(log) {
  return createServer((req, res) => {
    log.push({
      url: req.url,
      origin: req.headers.origin ?? null,
      mode: req.headers['sec-fetch-mode'] ?? null,
    });
    res.writeHead(200, { 'content-type': 'text/css', 'access-control-allow-origin': '*' });
    res.end('body { background: #fff; }');
  });
}

const listen = (server) =>
  new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));

// ---------------------------------------------------------------------------------------------
// Pixel statistics run in a plain browser page so the harness needs no image library.

async function makeDecoder(browser) {
  const page = await browser.newPage();
  return async (base64, mime) =>
    page.evaluate(
      async ({ base64, mime }) => {
        const blob = await (await fetch(`data:${mime};base64,${base64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
        let sum = 0,
          bright = 0,
          min = 1,
          max = 0,
          r = 0,
          g = 0,
          b = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          sum += l;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          if (l > 0.6) bright++;
          if (l < min) min = l;
          if (l > max) max = l;
        }
        return {
          mean: sum / n,
          brightPct: (100 * bright) / n,
          min,
          max,
          rgb: [r / n, g / n, b / n],
        };
      },
      { base64, mime },
    );
}

// ---------------------------------------------------------------------------------------------
// In-page text contrast. Walks open shadow roots too; backgrounds come from the nearest
// ancestor with an opaque-enough background colour (images are ignored).

function measureContrast() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
  const parentOf = (el) => el.parentElement ?? el.getRootNode()?.host ?? null;

  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = parentOf(e)) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 0.99) break;
    }
    let base = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };

  const elements = [];
  const visit = (rootNode) => {
    for (const el of rootNode.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      elements.push(el);
      if (elements.length >= 400) return;
    }
  };
  visit(document);

  let pass = 0;
  const failures = [];
  for (const el of elements) {
    const bg = background(el);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    if (ratio >= 4.5) pass++;
    else if (failures.length < 5) failures.push(`${el.tagName.toLowerCase()} ${ratio.toFixed(2)}`);
  }
  return {
    total: elements.length,
    passPct: elements.length ? (100 * pass) / elements.length : 100,
    failures,
  };
}

// ---------------------------------------------------------------------------------------------

async function openMode(mode) {
  // Each fixture gets its own origin (<name>.localhost), like separate real sites.
  const launchArgs = ['--host-resolver-rules=MAP *.localhost 127.0.0.1'];
  if (mode === 'ours') {
    launchArgs.push(`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`);
  }
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: VIEWPORT,
    args: launchArgs,
  });
  if (mode === 'darkreader') {
    await context.addInitScript({ path: require.resolve('darkreader/darkreader.js') });
    // The npm build needs <head>, so enable it the moment the parser creates one. This is
    // as early as the API allows; the Dark Reader extension itself starts a little earlier.
    await context.addInitScript(() => {
      const start = () => {
        DarkReader.setFetchMethod(window.fetch);
        DarkReader.enable({ brightness: 100, contrast: 100, sepia: 0 });
      };
      if (document.head) start();
      else {
        const mo = new MutationObserver(() => {
          if (document.head) {
            mo.disconnect();
            start();
          }
        });
        mo.observe(document, { childList: true, subtree: true });
      }
    });
  }
  if (mode === 'ours') {
    for (let i = 0; i < 100 && !context.serviceWorkers().length; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!context.serviceWorkers().length)
      throw new Error(`extension did not load from ${EXTENSION}`);
    // Give the background a moment to register the instant-on stylesheet.
    await new Promise((r) => setTimeout(r, 1500));
  }
  return context;
}

const DARK_START = 'data:text/html,<style>html{background:%23121212}</style>';

async function measureFlash(context, url, decode) {
  const page = await context.newPage();
  await page.goto(DARK_START);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 60,
    maxWidth: 640,
    maxHeight: 400,
  });
  const t0 = Date.now() / 1000;
  await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await cdp.send('Page.stopScreencast');
  await page.close();
  let white = 0,
    firstWhiteMs = null;
  for (const f of frames) {
    const s = await decode(f.data, 'image/jpeg');
    if (s.brightPct > 50) {
      white++;
      firstWhiteMs ??= Math.max(0, Math.round((f.t - t0) * 1000));
    }
  }
  return { frames: frames.length, white, firstWhiteMs };
}

async function measurePage(context, url, decode, fixture) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const perf = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics
      .filter((m) =>
        /^(TaskDuration|ScriptDuration|RecalcStyleDuration|LayoutDuration)$/.test(m.name),
      )
      .map((m) => [m.name, Math.round(m.value * 1000)]),
  );
  const early = await decode((await page.screenshot()).toString('base64'), 'image/png');
  const remaining = SETTLE_LATE_MS - 1000;
  if (remaining > 0) await page.waitForTimeout(remaining);
  const late = await decode((await page.screenshot()).toString('base64'), 'image/png');
  const contrast = await page.evaluate(measureContrast).catch(() => null);

  let images;
  if (fixture === 'images') {
    const shot = async (sel) =>
      decode((await page.locator(sel).screenshot()).toString('base64'), 'image/png');
    const icon = await shot('#icon');
    const photo = await shot('#photo');
    images = { iconRange: icon.max - icon.min, photoRgb: photo.rgb.map((v) => Math.round(v)) };
  }
  await page.close();
  return { perf, brightEarly: early.brightPct, brightLate: late.brightPct, contrast, images };
}

async function main() {
  const trapLog = [];
  const trap = trapServer(trapLog);
  const trapPort = await listen(trap);
  const server = fixtureServer(trapPort);
  const port = await listen(server);

  let targets;
  if (args.corpus) {
    const text = await readFile(resolve(here, args.corpus), 'utf8');
    targets = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((url) => ({ name: url, url }));
  } else {
    const files = (await readdir(join(here, 'fixtures'))).filter((f) => f.endsWith('.html'));
    const only = args.only?.split(',');
    targets = files
      .map((f) => f.replace(/\.html$/, ''))
      .filter((name) => !only || only.includes(name))
      .map((name) => ({
        name,
        url: `http://${name}.localhost:${port}/${name}.html`,
        fixture: name,
      }));
  }

  const decoderBrowser = await chromium.launch();
  const decode = await makeDecoder(decoderBrowser);
  const results = [];

  for (const mode of MODES) {
    const context = await openMode(mode);
    for (const target of targets) {
      const before = trapLog.length;
      process.stdout.write(`${mode.padEnd(10)} ${target.name} ... `);
      try {
        const flash = await measureFlash(context, target.url, decode);
        const page = await measurePage(context, target.url, decode, target.fixture);
        const fetched = trapLog.slice(before).filter((r) => r.origin || r.mode === 'cors');
        results.push({ mode, target: target.name, flash, ...page, trapFetches: fetched.length });
        console.log('ok');
      } catch (err) {
        results.push({ mode, target: target.name, error: String(err) });
        console.log('error', String(err).split('\n')[0]);
      }
    }
    await context.close();
  }

  await decoderBrowser.close();
  server.close();
  trap.close();

  const out = join(here, 'out');
  await mkdir(out, { recursive: true });
  const prefix = args.corpus ? 'corpus-' : '';
  await writeFile(join(out, `${prefix}results.json`), JSON.stringify(results, null, 2));
  const md = report(results);
  await writeFile(join(out, `${prefix}report.md`), md);
  console.log('\n' + md);
}

function report(results) {
  const fmt = (v, d = 1) => (v == null ? 'n/a' : typeof v === 'number' ? v.toFixed(d) : String(v));
  const lines = [
    '| Page | Mode | White frames | Bright % @1s | Bright % @8s | Text AA % | Task ms | Style ms | Extra fetches |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.target} | ${r.mode} | error: ${r.error.split('\n')[0]} |||||||`);
      continue;
    }
    lines.push(
      `| ${r.target} | ${r.mode} | ${r.flash.white}/${r.flash.frames} | ${fmt(r.brightEarly)} | ${fmt(r.brightLate)} | ${fmt(r.contrast?.passPct)} | ${r.perf.TaskDuration} | ${r.perf.RecalcStyleDuration} | ${r.trapFetches} |`,
    );
  }
  const imgs = results.filter((r) => r.images);
  if (imgs.length) {
    lines.push('', '| Mode | Icon luminance range | Photo mean RGB |', '| --- | --- | --- |');
    for (const r of imgs)
      lines.push(`| ${r.mode} | ${fmt(r.images.iconRange, 2)} | ${r.images.photoRgb.join(', ')} |`);
  }
  return lines.join('\n') + '\n';
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
