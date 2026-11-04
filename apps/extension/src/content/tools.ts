import {
  type ColorRole,
  type RGBA,
  type Theme,
  contrastRatio,
  expandTemplates,
  luminance,
  parseColor,
  toHex,
} from '@sdm/engine';
import { MAX_RULE_CSS, siteDomain, updateRule } from '@sdm/settings';
import { t } from '@/lib/i18n';
import { reportUrl } from '@/lib/report';
import { loadSettings, saveSettings } from '@/lib/settings-store';

/**
 * Page tools: the element picker ("Fix this"), the debug overlay and the self-diagnosis
 * chip. Their UI lives in one closed shadow root, so page styles cannot reach it and the
 * page cannot read it.
 */

const HOST_TAG = 'sdm-ui';
const PREVIEW_ID = 'sdm-picker-preview';

export interface ToolsContext {
  /** The current dark theme, or null when the engine is not running. */
  theme(): Theme | null;
  /** Original colours that convert to `shown`, from the engine's palette. */
  originalsOf(shown: string, role: ColorRole): string[];
}

// --- Shared UI root ---------------------------------------------------------------------

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;

const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font: 13px/1.4 system-ui, sans-serif; }
.box { position: fixed; pointer-events: none; border: 2px solid #f0a35e; background: rgb(240 163 94 / 0.15); z-index: 2147483646; border-radius: 2px; }
.panel { position: fixed; z-index: 2147483647; background: #1f1f24; color: #ececf1; border: 1px solid #3a3a42; border-radius: 10px; padding: 12px; box-shadow: 0 8px 32px rgb(0 0 0 / 0.5); max-width: min(360px, calc(100vw - 32px)); }
.panel h2 { font-weight: 600; font-size: 14px; margin: 0 0 8px; }
.panel label { display: flex; gap: 8px; align-items: center; margin: 4px 0; cursor: pointer; }
.panel input[type=text] { width: 100%; padding: 4px 6px; background: #121216; color: inherit; border: 1px solid #3a3a42; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 12px; }
.row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
button { cursor: pointer; padding: 5px 10px; border-radius: 6px; border: 1px solid #3a3a42; background: #2a2a31; color: inherit; }
button.primary { background: #f0a35e; color: #1a1206; border-color: #f0a35e; font-weight: 600; }
button:focus-visible, input:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
.tip { position: fixed; z-index: 2147483647; pointer-events: none; background: #1f1f24; color: #ececf1; border: 1px solid #3a3a42; border-radius: 6px; padding: 6px 8px; font-family: ui-monospace, monospace; font-size: 11px; white-space: pre; max-width: 420px; overflow: hidden; }
.sw { display: inline-block; width: 10px; height: 10px; border: 1px solid #888; vertical-align: middle; }
.chip { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; background: #1f1f24; color: #ececf1; border: 1px solid #3a3a42; border-radius: 12px; padding: 10px 12px; box-shadow: 0 8px 32px rgb(0 0 0 / 0.5); max-width: min(340px, calc(100vw - 32px)); }
.chip p { margin: 0 0 8px; }
.close { position: absolute; top: 4px; right: 6px; border: 0; background: none; padding: 2px 6px; }
`;

function ui(): ShadowRoot {
  if (root && host?.isConnected) return root;
  host = document.createElement(HOST_TAG);
  host.setAttribute('data-sdm', 'ui');
  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  root.append(style);
  document.documentElement.append(host);
  return root;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function isOwn(node: Element | null): boolean {
  return Boolean(node && (node === host || node.closest(HOST_TAG)));
}

// --- Selectors and colours --------------------------------------------------------------

/** Class names that look generated (CSS modules, styled-components) change between builds. */
const UNSTABLE_CLASS =
  /\d{3,}|^(css|sc|jsx|svelte|emotion)-|__[a-z0-9]{5,}$|^[a-z]{1,3}-[A-Za-z0-9]{5,}$/;

function unique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** A short selector that matches only `target`, preferring ids and stable class names. */
export function selectorFor(target: Element): string {
  const parts: string[] = [];
  let node: Element | null = target;
  while (node && node !== document.documentElement && parts.length < 6) {
    if (node.id && !/\d{4,}/.test(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      const sel = parts.join(' > ');
      if (unique(sel)) return sel;
      parts[0] = `${node.localName}#${CSS.escape(node.id)}`;
    } else {
      let part = node.localName;
      const classes = [...node.classList].filter((c) => !UNSTABLE_CLASS.test(c)).slice(0, 2);
      part += classes.map((c) => `.${CSS.escape(c)}`).join('');
      const parent: Element | null = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === node?.localName);
        if (same.length > 1 && !unique([part, ...parts].join(' > '))) {
          part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
    }
    const sel = parts.join(' > ');
    if (unique(sel)) return sel;
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** The colour shown behind an element: its own background or the nearest opaque one above. */
function effectiveBackground(start: Element): RGBA {
  for (let node: Element | null = start; node; node = node.parentElement) {
    const c = parseColor(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0.5) return c;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

// --- Element picker ---------------------------------------------------------------------

export type FixOption = 'invert' | 'background' | 'text' | 'noImage' | 'hide';
const FIX_OPTIONS: FixOption[] = ['invert', 'background', 'text', 'noImage', 'hide'];

/** CSS for the chosen fixes. Colours are `${...}` templates, converted with the theme. */
export function fixCss(selector: string, options: ReadonlySet<FixOption>): string {
  const decl: string[] = [];
  if (options.has('invert')) decl.push('filter: invert(0.9) hue-rotate(180deg) !important;');
  if (options.has('background')) decl.push('background-color: ${#ffffff} !important;');
  if (options.has('text')) decl.push('color: ${#000000} !important;');
  if (options.has('noImage')) decl.push('background-image: none !important;');
  if (options.has('hide')) decl.push('display: none !important;');
  if (!decl.length || !selector.trim()) return '';
  return `${selector} {\n  ${decl.join('\n  ')}\n}`;
}

let picker: { stop(): void } | null = null;
let lastContextTarget: Element | null = null;

document.addEventListener(
  'contextmenu',
  (e) => {
    lastContextTarget = e.target instanceof Element ? e.target : null;
  },
  true,
);

function preview(css: string, ctx: ToolsContext): void {
  let style = document.getElementById(PREVIEW_ID);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = PREVIEW_ID;
    style.setAttribute('data-sdm', PREVIEW_ID);
    (document.head ?? document.documentElement).append(style);
  }
  style.textContent = expandTemplates(css, ctx.theme());
}

/**
 * Starts the picker. With `fromContextMenu`, the element under the last right click is
 * selected straight away.
 */
export function startPicker(ctx: ToolsContext, fromContextMenu = false): void {
  picker?.stop();
  const shadow = ui();
  const box = el('div', { class: 'box', hidden: '' });
  shadow.append(box);
  let panel: HTMLElement | null = null;
  let hovered: Element | null = null;

  const place = (target: Element | null) => {
    if (!target) {
      box.hidden = true;
      return;
    }
    const r = target.getBoundingClientRect();
    Object.assign(box.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    box.hidden = false;
  };

  const onMove = (e: PointerEvent) => {
    if (panel) return;
    const target = document.elementsFromPoint(e.clientX, e.clientY).find((n) => !isOwn(n)) ?? null;
    if (target !== hovered) {
      hovered = target;
      place(target);
    }
  };
  const onClick = (e: MouseEvent) => {
    if (panel || isOwn(e.target as Element)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (hovered) choose(hovered);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') stop();
  };

  function choose(target: Element): void {
    let current = target;
    place(current);
    const chosen = new Set<FixOption>();
    const input = el('input', { type: 'text', 'aria-label': t('pickerSelector') });
    input.value = selectorFor(current);
    const update = () => preview(fixCss(input.value, chosen), ctx);
    input.addEventListener('input', update);
    const boxes = FIX_OPTIONS.map((option) => {
      const check = el('input', { type: 'checkbox' });
      check.addEventListener('change', () => {
        if (check.checked) chosen.add(option);
        else chosen.delete(option);
        update();
      });
      return el('label', {}, check, t(`pickerOption_${option}`));
    });
    const parent = el('button', { type: 'button' }, t('pickerParent'));
    parent.addEventListener('click', () => {
      const up = current.parentElement;
      if (!up || up === document.documentElement) return;
      current = up;
      input.value = selectorFor(current);
      place(current);
      update();
    });
    const save = el('button', { type: 'button', class: 'primary' }, t('pickerSave'));
    save.addEventListener('click', () => {
      const css = fixCss(input.value, chosen);
      if (css) void saveFix(css).then(stop);
    });
    const cancel = el('button', { type: 'button' }, t('cancel'));
    cancel.addEventListener('click', stop);
    panel = el(
      'div',
      { class: 'panel', role: 'dialog', 'aria-label': t('pickerTitle') },
      el('h2', {}, t('pickerTitle')),
      input,
      ...boxes,
      el('div', { class: 'row' }, save, parent, cancel),
    );
    const r = current.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 376))}px`;
    panel.style.top = r.bottom + 260 < innerHeight ? `${Math.max(8, r.bottom + 8)}px` : '8px';
    shadow.append(panel);
    input.focus();
  }

  function stop(): void {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    box.remove();
    panel?.remove();
    preview('', ctx);
    picker = null;
  }

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  picker = { stop };
  if (fromContextMenu && lastContextTarget && !isOwn(lastContextTarget)) choose(lastContextTarget);
}

/** Appends generated CSS to this site's rule. */
async function saveFix(css: string): Promise<void> {
  const settings = await loadSettings();
  const domain = siteDomain(location.hostname);
  const key = `domain:${domain}`;
  const existing = settings.rules[key]?.css ?? '';
  const next = existing ? `${existing}\n\n${css}` : css;
  if (next.length > MAX_RULE_CSS) return;
  await saveSettings(updateRule(settings, 'domain', domain, { css: next }));
}

// --- Debug overlay ----------------------------------------------------------------------

let debug: { stop(): void } | null = null;

/** Last rule in a readable stylesheet that sets `prop` on `target` (best effort). */
function likelyRule(target: Element, prop: string): string {
  if (target instanceof HTMLElement && target.style.getPropertyValue(prop)) return 'style=""';
  let found = '';
  let seen = 0;
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (++seen > 20_000) return found;
      if (!(rule instanceof CSSStyleRule) || !rule.style.getPropertyValue(prop)) continue;
      try {
        if (target.matches(rule.selectorText)) found = rule.selectorText;
      } catch {
        // Selectors this engine cannot match (vendor prefixes).
      }
    }
  }
  return found.length > 60 ? `${found.slice(0, 57)}...` : found;
}

export function debugActive(): boolean {
  return debug !== null;
}

export function toggleDebug(ctx: ToolsContext): boolean {
  if (debug) {
    debug.stop();
    return false;
  }
  const shadow = ui();
  const tip = el('div', { class: 'tip', hidden: '' });
  const box = el('div', { class: 'box', hidden: '' });
  shadow.append(box, tip);
  let last: Element | null = null;
  const describe = (shown: RGBA, role: ColorRole) => {
    const hex = toHex(shown);
    const originals = ctx.originalsOf(hex, role).slice(0, 2);
    return `${hex}${originals.length ? `  <-  ${originals.join(', ')}` : ''}`;
  };
  const onMove = (e: PointerEvent) => {
    const target = document.elementsFromPoint(e.clientX, e.clientY).find((n) => !isOwn(n)) ?? null;
    if (!target) return;
    if (target !== last) {
      last = target;
      const cs = getComputedStyle(target);
      const text = parseColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
      const bg = effectiveBackground(target);
      const lines = [
        selectorFor(target).slice(-70),
        `${t('debugBackground')}: ${describe(bg, 'background')}`,
        `${t('debugText')}: ${describe(text, 'text')}`,
        `${t('debugContrast')}: ${contrastRatio(text, bg).toFixed(2)}`,
      ];
      const rule = likelyRule(target, 'background-color') || likelyRule(target, 'color');
      if (rule) lines.push(`${t('debugRule')}: ${rule}`);
      tip.textContent = lines.join('\n');
      const r = target.getBoundingClientRect();
      Object.assign(box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      box.hidden = false;
      tip.hidden = false;
    }
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 430)}px`;
    tip.style.top = `${e.clientY + 120 < innerHeight ? e.clientY + 14 : e.clientY - 110}px`;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') debug?.stop();
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('keydown', onKey, true);
  debug = {
    stop() {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('keydown', onKey, true);
      tip.remove();
      box.remove();
      debug = null;
    },
  };
  return true;
}

// --- Self-diagnosis ---------------------------------------------------------------------

export interface Diagnosis {
  samples: number;
  /** Share of sampled points showing a bright background (luminance above 0.7). */
  bright: number;
  /** Share of sampled text with a contrast ratio below 3. */
  lowContrast: number;
}

/** Samples a grid of points and measures what the user actually sees. */
export function diagnose(): Diagnosis {
  const cols = 8;
  const rows = 6;
  let samples = 0;
  let bright = 0;
  let textSamples = 0;
  let low = 0;
  const width = document.documentElement.clientWidth || innerWidth;
  const height = document.documentElement.clientHeight || innerHeight;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = ((i + 0.5) / cols) * width;
      const y = ((j + 0.5) / rows) * height;
      const target = document.elementsFromPoint(x, y).find((n) => !isOwn(n));
      if (!target) continue;
      // Photos and canvases are bright for good reasons; they are judged elsewhere.
      if (target.closest('img, video, canvas, picture, svg, iframe')) continue;
      const cs = getComputedStyle(target);
      if (cs.backgroundImage !== 'none' && !cs.backgroundImage.includes('gradient')) continue;
      samples++;
      const bg = effectiveBackground(target);
      if (luminance(bg) > 0.7) bright++;
      const hasText = [...target.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (hasText) {
        textSamples++;
        const fg = parseColor(cs.color);
        if (fg && contrastRatio(fg, bg) < 3) low++;
      }
    }
  }
  return {
    samples,
    bright: samples ? bright / samples : 0,
    lowContrast: textSamples >= 3 ? low / textSamples : 0,
  };
}

export function needsHelp(d: Diagnosis): boolean {
  return d.samples >= 8 && (d.bright > 0.15 || d.lowContrast > 0.3);
}

const DISMISSED_KEY = 'diagnosis-dismissed';

async function dismissed(origin: string): Promise<boolean> {
  const data = await browser.storage.local.get(DISMISSED_KEY);
  const map = (data[DISMISSED_KEY] ?? {}) as Record<string, number>;
  return typeof map[origin] === 'number';
}

async function dismiss(origin: string): Promise<void> {
  const data = await browser.storage.local.get(DISMISSED_KEY);
  const map = { ...((data[DISMISSED_KEY] ?? {}) as Record<string, number>), [origin]: Date.now() };
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500);
  await browser.storage.local.set({ [DISMISSED_KEY]: Object.fromEntries(entries) });
}

/** Shows the chip when the converted page still looks wrong. Runs once per page load. */
export async function maybeShowChip(
  ctx: ToolsContext,
  onFiltered: () => Promise<void>,
): Promise<void> {
  const origin = location.origin;
  if (origin === 'null' || (await dismissed(origin))) return;
  const result = diagnose();
  if (!needsHelp(result)) return;
  const shadow = ui();
  const close = el('button', { type: 'button', class: 'close', 'aria-label': t('close') }, '×');
  const filtered = el('button', { type: 'button', class: 'primary' }, t('chipTryFiltered'));
  const fix = el('button', { type: 'button' }, t('chipFixElement'));
  const report = el('button', { type: 'button' }, t('reportProblem'));
  const chip = el(
    'div',
    { class: 'chip', role: 'status' },
    close,
    el('p', {}, t('chipMessage')),
    el('div', { class: 'row' }, filtered, fix, report),
  );
  close.addEventListener('click', () => {
    chip.remove();
    void dismiss(origin);
  });
  filtered.addEventListener('click', () => {
    chip.remove();
    void onFiltered();
  });
  fix.addEventListener('click', () => {
    chip.remove();
    startPicker(ctx);
  });
  report.addEventListener('click', () => {
    const note = `Diagnosis: ${Math.round(result.bright * 100)}% bright, ${Math.round(result.lowContrast * 100)}% low contrast`;
    window.open(reportUrl({ host: location.hostname }, 'dark', note), '_blank', 'noopener');
  });
  shadow.append(chip);
}
