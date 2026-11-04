import {
  type ColorRole,
  type RuleLike,
  type Theme,
  VarRegistry,
  parseColor,
  toHex,
  rewriteRules,
  rewriteValue,
  roleForProperty,
  scanUsage,
} from '@sdm/engine';
import type { FetchRequest, FetchResponse } from '@/lib/messages';
import { INLINE_PROPS, baseCss, inlineAttr, inlineVar, overrideCss } from './base-css';
import { RunawayGuard } from './runaway';

const OWN_ATTR = 'data-sdm';
const SOURCE_SELECTOR = 'style, link[rel~="stylesheet"]';
const LEGACY_ATTRS: Record<string, string> = {
  bgcolor: 'background-color',
  color: 'color',
  fill: 'fill',
  stroke: 'stroke',
};
const FRAME_BUDGET_MS = 8;

type SourceNode = HTMLStyleElement | HTMLLinkElement | SVGStyleElement;
type Root = Document | ShadowRoot;

interface SourceState {
  override: HTMLStyleElement | null;
  /** Rules from a cross-origin sheet, fetched by the background. */
  fetched?: CSSStyleSheet;
  fetching?: boolean;
}

export interface DynamicThemeHooks {
  /** Called after the first full render, and whenever generated CSS changes (throttled by caller). */
  onRendered?: (css: string) => void;
  /** Called once when the runaway guard switches the page to simplified mode. */
  onSimplified?: () => void;
}

function isOwn(node: Node): boolean {
  return node instanceof Element && node.hasAttribute(OWN_ATTR);
}

function isSource(node: Node): node is SourceNode {
  if (!(node instanceof Element) || isOwn(node)) return false;
  if (node instanceof HTMLLinkElement) return /\bstylesheet\b/i.test(node.rel) && !node.disabled;
  return node.localName === 'style';
}

async function fetchCss(url: string): Promise<string | null> {
  const request: FetchRequest = { type: 'sdm:fetch', kind: 'css', url };
  try {
    const res = (await browser.runtime.sendMessage(request)) as FetchResponse | undefined;
    return res?.ok ? res.data : null;
  } catch {
    return null;
  }
}

/**
 * Converts a page's own styles into a dark theme:
 * one override <style> right after each source sheet (so the cascade order holds),
 * constructed override sheets after adopted sheets, and custom properties for inline styles.
 */
export class DynamicTheme {
  private theme: Theme;
  private readonly vars = new VarRegistry();
  private readonly sources = new Map<SourceNode, SourceState>();
  private readonly adoptedOverrides = new WeakMap<CSSStyleSheet, CSSStyleSheet>();
  private readonly ownSheets = new WeakSet<CSSStyleSheet>();
  private readonly roots = new Set<Root>();
  private readonly inlineElements = new Set<Element>();
  private readonly observer: MutationObserver;
  private readonly guard = new RunawayGuard();
  private base: HTMLStyleElement | null = null;
  private overrides: HTMLStyleElement | null = null;
  private queue = new Set<SourceNode | Element | Root>();
  private frame = 0;
  private renderedVarsVersion = 0;
  private stopped = false;
  private adoptedPoll = 0;

  constructor(
    theme: Theme,
    private readonly hooks: DynamicThemeHooks = {},
  ) {
    this.theme = theme;
    this.observer = new MutationObserver((records) => this.onMutations(records));
  }

  /** Original colours seen on the page, for the colour remapping UI. */
  private readonly colours = new Map<string, { count: number; roles: Set<ColorRole> }>();

  private readonly onColor = (original: string, role: ColorRole): void => {
    if (this.colours.size > 2000) return;
    const parsed = parseColor(original);
    if (!parsed || parsed.a === 0) return;
    const hex = toHex(parsed);
    const entry = this.colours.get(hex);
    if (entry) {
      entry.count++;
      entry.roles.add(role);
    } else this.colours.set(hex, { count: 1, roles: new Set([role]) });
  };

  /** Most used original colours, most frequent first. */
  palette(limit = 24): { hex: string; roles: ColorRole[]; count: number }[] {
    return [...this.colours.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([hex, { count, roles }]) => ({ hex, roles: [...roles], count }));
  }

  /** Switches every style this engine added on or off, without removing anything. */
  setSuspended(suspended: boolean): void {
    for (const root of this.roots) {
      for (const sheet of root.adoptedStyleSheets) {
        if (this.ownSheets.has(sheet)) sheet.disabled = suspended;
      }
      for (const el of root.querySelectorAll<HTMLStyleElement>(`style[${OWN_ATTR}]`)) {
        el.disabled = suspended;
      }
    }
  }

  start(): void {
    this.injectBase();
    this.addRoot(document);
    document.addEventListener('__sdm:shadow', this.onShadowEvent, true);
    document.addEventListener('__sdm:sheet', this.onSheetEvent, true);
    document.addEventListener('__sdm:adopted', this.onAdoptedEvent, true);
    this.adoptedPoll = window.setInterval(
      () => this.roots.forEach((r) => this.syncAdopted(r)),
      1000,
    );
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.addRoot(document), { once: true });
    }
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    clearInterval(this.adoptedPoll);
    this.observer.disconnect();
    document.removeEventListener('__sdm:shadow', this.onShadowEvent, true);
    document.removeEventListener('__sdm:sheet', this.onSheetEvent, true);
    document.removeEventListener('__sdm:adopted', this.onAdoptedEvent, true);
    for (const state of this.sources.values()) state.override?.remove();
    this.sources.clear();
    for (const root of this.roots) {
      try {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => !this.ownSheets.has(s));
      } catch {
        // Firefox before 153 cannot write adoptedStyleSheets from a content script.
      }
    }
    for (const el of this.inlineElements) this.clearInline(el);
    this.inlineElements.clear();
    this.base?.remove();
    this.overrides?.remove();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.injectBase();
    for (const node of this.sources.keys()) this.enqueue(node);
    for (const el of this.inlineElements) this.enqueue(el);
    for (const root of this.roots) this.enqueue(root);
  }

  get simplified(): boolean {
    return this.guard.simplified;
  }

  /** All generated CSS, for the instant-on cache. */
  generatedCss(): string {
    const parts = [this.base?.textContent ?? '', this.overrides?.textContent ?? ''];
    for (const s of this.sources.values())
      if (s.override?.textContent) parts.push(s.override.textContent);
    return parts.join('\n');
  }

  private injectBase(): void {
    const head = document.head ?? document.documentElement;
    if (!this.base) {
      this.base = document.createElement('style');
      this.base.setAttribute(OWN_ATTR, 'base');
    }
    if (!this.overrides) {
      this.overrides = document.createElement('style');
      this.overrides.setAttribute(OWN_ATTR, 'overrides');
    }
    this.base.textContent = baseCss(this.theme);
    this.overrides.textContent = overrideCss();
    if (this.base.parentNode !== head || head.firstChild !== this.base) head.prepend(this.base);
    if (this.overrides.parentNode !== head) head.append(this.overrides);
  }

  private addRoot(root: Root): void {
    if (!this.roots.has(root)) {
      this.roots.add(root);
      this.observer.observe(root instanceof Document ? root.documentElement : root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: !this.guard.simplified,
        attributeFilter: [
          'style',
          'bgcolor',
          'color',
          'fill',
          'stroke',
          'media',
          'disabled',
          'rel',
        ],
      });
    }
    this.enqueue(root);
    this.discoverShadowRoots(root);
  }

  /**
   * Picks up open shadow roots that were attached before our listener existed (the page's
   * scripts can run while settings are still loading) or inside newly added subtrees.
   */
  private discoverShadowRoots(scope: Root | Element): void {
    if (scope instanceof Element && scope.shadowRoot) this.addRoot(scope.shadowRoot);
    for (const el of scope.querySelectorAll('*')) {
      if (el.shadowRoot && !this.roots.has(el.shadowRoot)) this.addRoot(el.shadowRoot);
    }
  }

  private enqueue(item: SourceNode | Element | Root): void {
    if (this.stopped) return;
    this.queue.add(item);
    if (!this.frame) this.frame = requestAnimationFrame(() => this.flush());
  }

  /** Processes queued work, at most FRAME_BUDGET_MS per animation frame. */
  private flush(): void {
    this.frame = 0;
    if (this.stopped) return;
    const start = performance.now();

    // Scan all newly seen sheets first so variable roles are known before rendering.
    const items = [...this.queue];
    this.queue.clear();
    const sourcesToRender: SourceNode[] = [];
    for (const item of items) {
      if (item instanceof Document || item instanceof ShadowRoot) {
        for (const node of item.querySelectorAll<SourceNode>(SOURCE_SELECTOR)) {
          if (isSource(node)) sourcesToRender.push(node);
        }
        this.syncAdopted(item);
        if (!this.guard.simplified) {
          for (const el of item.querySelectorAll(
            '[style], [bgcolor], [color], svg [fill], svg [stroke]',
          )) {
            this.queue.add(el);
          }
        }
      } else if (isSource(item)) {
        sourcesToRender.push(item);
      } else if (item instanceof Element) {
        this.queue.add(item);
      }
    }
    for (const node of sourcesToRender) {
      const rules = this.rulesOf(node);
      if (rules) scanUsage(rules, this.vars);
    }
    const varsChanged = this.vars.version !== this.renderedVarsVersion;
    this.renderedVarsVersion = this.vars.version;
    const toRender = new Set(sourcesToRender);
    if (varsChanged) for (const node of this.sources.keys()) toRender.add(node);

    for (const node of toRender) {
      if (this.guard.allow(node)) this.renderSource(node);
    }

    // Inline styles: the rest of the budget, then yield.
    for (const item of [...this.queue]) {
      if (performance.now() - start > FRAME_BUDGET_MS) break;
      this.queue.delete(item);
      if (item instanceof Element && !isSource(item) && this.guard.allow(item))
        this.renderInline(item);
    }

    if (this.guard.simplified && !this.guard.notified) {
      this.guard.notified = true;
      this.hooks.onSimplified?.();
    }
    if (this.queue.size) this.frame = requestAnimationFrame(() => this.flush());
    else this.hooks.onRendered?.(this.generatedCss());
  }

  private rulesOf(node: SourceNode): ArrayLike<RuleLike> | null {
    const sheet = node.sheet as CSSStyleSheet | null;
    if (!sheet) {
      if (node instanceof HTMLLinkElement) {
        node.addEventListener('load', () => this.enqueue(node), { once: true });
      }
      return null;
    }
    try {
      return sheet.cssRules;
    } catch {
      return this.crossOriginRules(node, sheet);
    }
  }

  private crossOriginRules(node: SourceNode, sheet: CSSStyleSheet): ArrayLike<RuleLike> | null {
    let state = this.sources.get(node);
    if (!state) this.sources.set(node, (state = { override: null }));
    if (state.fetched) return state.fetched.cssRules;
    if (!state.fetching && sheet.href) {
      state.fetching = true;
      void fetchCss(sheet.href).then((text) => {
        if (text === null || this.stopped) return;
        const parsed = new CSSStyleSheet();
        try {
          parsed.replaceSync(text);
        } catch {
          return;
        }
        state.fetched = parsed;
        this.enqueue(node);
      });
    }
    return null;
  }

  private renderSource(node: SourceNode): void {
    let state = this.sources.get(node);
    if (!state) this.sources.set(node, (state = { override: null }));
    if (!node.isConnected) {
      state.override?.remove();
      this.sources.delete(node);
      return;
    }
    const rules = this.rulesOf(node);
    if (!rules) return;
    const baseUrl = (node.sheet as CSSStyleSheet | null)?.href ?? document.baseURI;
    const css = rewriteRules(rules, {
      theme: this.theme,
      vars: this.vars,
      baseUrl,
      onColor: this.onColor,
    });
    if (!css) {
      state.override?.remove();
      state.override = null;
      return;
    }
    if (!state.override) {
      state.override = document.createElement('style');
      state.override.setAttribute(OWN_ATTR, 'sheet');
    }
    const media = node.getAttribute('media');
    if (media) state.override.setAttribute('media', media);
    else state.override.removeAttribute('media');
    if (state.override.textContent !== css) state.override.textContent = css;
    if (node.nextSibling !== state.override) node.after(state.override);
  }

  private syncAdopted(root: Root): void {
    let sheets: readonly CSSStyleSheet[];
    try {
      sheets = root.adoptedStyleSheets;
    } catch {
      return;
    }
    if (!sheets.length) return;
    const page = sheets.filter((s) => !this.ownSheets.has(s));
    const next: CSSStyleSheet[] = [];
    for (const sheet of page) {
      next.push(sheet);
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      scanUsage(rules, this.vars);
      const css = rewriteRules(rules, {
        theme: this.theme,
        vars: this.vars,
        onColor: this.onColor,
      });
      if (!css) continue;
      let override = this.adoptedOverrides.get(sheet);
      if (!override) {
        override = new CSSStyleSheet();
        this.ownSheets.add(override);
        this.adoptedOverrides.set(sheet, override);
      }
      override.replaceSync(css);
      next.push(override);
    }
    const same = next.length === sheets.length && next.every((s, i) => s === sheets[i]);
    if (!same) {
      try {
        root.adoptedStyleSheets = next;
      } catch {
        // Firefox before 153: no write access from content scripts.
      }
    }
  }

  private renderInline(el: Element): void {
    if (!el.isConnected || isOwn(el)) return;
    const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
    let any = false;
    for (const prop of INLINE_PROPS) {
      const value = style?.getPropertyValue(prop);
      const role = roleForProperty(prop);
      const out =
        value && role
          ? rewriteValue(value, role, {
              theme: this.theme,
              rewriteVars: true,
              onColor: this.onColor,
            })
          : null;
      any = this.setInline(el, prop, out) || any;
    }
    for (const [attr, prop] of Object.entries(LEGACY_ATTRS)) {
      if (prop === 'color' && el.localName !== 'font') continue;
      if ((prop === 'fill' || prop === 'stroke') && !(el instanceof SVGElement)) continue;
      if (style?.getPropertyValue(prop)) continue;
      const value = el.getAttribute(attr);
      const role = roleForProperty(prop);
      const out =
        value && role
          ? rewriteValue(value, role, {
              theme: this.theme,
              rewriteVars: false,
              onColor: this.onColor,
            })
          : null;
      any = this.setInline(el, prop, out) || any;
    }
    if (any) this.inlineElements.add(el);
    else this.inlineElements.delete(el);
  }

  /** Returns true when the element now carries an override for `prop`. */
  private setInline(el: Element, prop: string, value: string | null): boolean {
    const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
    if (!style) return false;
    if (value === null) {
      if (el.hasAttribute(inlineAttr(prop))) {
        el.removeAttribute(inlineAttr(prop));
        style.removeProperty(inlineVar(prop));
      }
      return false;
    }
    if (style.getPropertyValue(inlineVar(prop)) !== value)
      style.setProperty(inlineVar(prop), value);
    if (!el.hasAttribute(inlineAttr(prop))) el.setAttribute(inlineAttr(prop), '');
    return true;
  }

  private clearInline(el: Element): void {
    for (const prop of [...INLINE_PROPS, ...Object.values(LEGACY_ATTRS)])
      this.setInline(el, prop, null);
  }

  private onMutations(records: MutationRecord[]): void {
    for (const r of records) {
      const target = r.target;
      if (isOwn(target) || (target.parentNode && isOwn(target.parentNode))) continue;
      if (r.type === 'attributes') {
        if (r.attributeName?.startsWith('data-sdm') || !(target instanceof Element)) continue;
        if (isSource(target) || target instanceof HTMLLinkElement)
          this.enqueue(target as SourceNode);
        else if (!this.guard.simplified) this.enqueue(target);
        continue;
      }
      // Text inside a <style> changed.
      const styleParent = target instanceof Element ? target : target.parentElement;
      if (styleParent && isSource(styleParent)) this.enqueue(styleParent);
      for (const node of r.addedNodes) {
        if (isOwn(node)) continue;
        if (isSource(node)) this.enqueue(node);
        else if (node instanceof Element) {
          this.discoverShadowRoots(node);
          for (const s of node.querySelectorAll<SourceNode>(SOURCE_SELECTOR))
            if (isSource(s)) this.enqueue(s);
          if (!this.guard.simplified) {
            if (node.hasAttribute('style') || node.hasAttribute('bgcolor')) this.enqueue(node);
            for (const el of node.querySelectorAll(
              '[style], [bgcolor], svg [fill], svg [stroke]',
            )) {
              this.enqueue(el);
            }
          }
        }
      }
      for (const node of r.removedNodes) {
        if (isSource(node)) {
          this.sources.get(node)?.override?.remove();
          this.sources.delete(node);
        }
      }
    }
    // Keep our base sheet first and overrides last if the page reshuffles <head>.
    const head = document.head;
    if (head && (head.firstChild !== this.base || this.overrides?.parentNode !== head))
      this.injectBase();
  }

  private readonly onShadowEvent = (e: Event): void => {
    const host = e.composedPath()[0];
    if (host instanceof Element && host.shadowRoot) this.addRoot(host.shadowRoot);
  };

  private readonly onSheetEvent = (e: Event): void => {
    const node = e.composedPath()[0];
    if (node instanceof Node && isSource(node)) this.enqueue(node);
  };

  private readonly onAdoptedEvent = (e: Event): void => {
    const target = e.composedPath()[0];
    if (target instanceof Element && target.shadowRoot) this.addRoot(target.shadowRoot);
    else for (const root of this.roots) this.enqueue(root);
  };
}
