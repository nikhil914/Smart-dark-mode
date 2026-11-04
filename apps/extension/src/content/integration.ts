import { luminance, parseColor } from '@sdm/engine';
import { omitKey } from '@sdm/settings';
import type { Integration, IntegrationAction, Target } from '@/data/integrations';

/**
 * Deep Integration: switches a site's own dark theme on, and undoes it.
 *
 * DOM changes (attributes, classes) are remembered in memory and undone live.
 * Storage and cookie writes outlive the page, so each one is recorded in a journal in
 * extension storage before it is made, with the value it replaced. When the user turns
 * the integration off for the site (or turns the extension off), the next page view on
 * that origin restores the old values from the journal (Night Eye flaw F8).
 */

export const JOURNAL_KEY = 'journal';

export interface JournalEntry {
  kind: 'localStorage' | 'cookie';
  key: string;
  /** Value before our first write; null when there was none. */
  previous: string | null;
  value: string;
  integration: string;
  at: number;
}

export interface OriginJournal {
  entries: JournalEntry[];
  /** Last reload we triggered, to stop reload loops when a site rewrites its preference. */
  reloadedAt?: number;
}

export type Journal = Record<string, OriginJournal>;

export async function readJournal(): Promise<Journal> {
  const data = await browser.storage.local.get(JOURNAL_KEY);
  const value = data[JOURNAL_KEY];
  return typeof value === 'object' && value !== null ? (value as Journal) : {};
}

async function writeOrigin(origin: string, entry: OriginJournal | null): Promise<void> {
  const rest = omitKey(await readJournal(), origin);
  const journal =
    entry && (entry.entries.length || entry.reloadedAt) ? { ...rest, [origin]: entry } : rest;
  await browser.storage.local.set({ [JOURNAL_KEY]: journal });
}

function element(target: Target): HTMLElement | null {
  return target === 'html' ? document.documentElement : document.body;
}

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function writeCookie(name: string, value: string | null, days: number): void {
  const age = value === null ? 0 : Math.round(days * 86400);
  document.cookie = `${name}=${value ?? ''}; path=/; max-age=${age}; SameSite=Lax`;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked by the browser or the site; nothing to undo either.
  }
}

/** Undo information for DOM actions, kept for the life of the page. */
interface DomUndo {
  el: HTMLElement;
  restore: () => void;
}

export class IntegrationController {
  private domUndo: DomUndo[] = [];
  private observer: MutationObserver | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  active: Integration | null = null;

  constructor(private readonly origin: string) {}

  /** Applies DOM actions now and storage actions once. Resolves to true if the page should reload. */
  async enable(integration: Integration): Promise<boolean> {
    this.active = integration;
    this.applyDom(integration.actions);
    // Frameworks sometimes reset <html> attributes while hydrating: re-apply for a few seconds.
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.applyDom(integration.actions));
    const watch = () => {
      for (const target of ['html', 'body'] as const) {
        const el = element(target);
        if (el) this.observer?.observe(el, { attributes: true, attributeFilter: ['class'] });
      }
      for (const a of integration.actions) {
        if (a.type !== 'attr') continue;
        const el = element(a.target);
        if (el) this.observer?.observe(el, { attributes: true, attributeFilter: [a.name] });
      }
    };
    watch();
    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          this.applyDom(integration.actions);
          watch();
        },
        { once: true },
      );
    }
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => this.observer?.disconnect(), 10_000);

    const wrote = await this.applyStorage(integration);
    if (!wrote || !integration.reload) return false;
    const journal = (await readJournal())[this.origin] ?? { entries: [] };
    if (journal.reloadedAt && Date.now() - journal.reloadedAt < 60_000) return false;
    await writeOrigin(this.origin, { ...journal, reloadedAt: Date.now() });
    return true;
  }

  private applyDom(actions: readonly IntegrationAction[]): void {
    for (const action of actions) {
      if (action.type === 'attr') {
        const el = element(action.target);
        if (!el || el.getAttribute(action.name) === action.value) continue;
        const previous = el.getAttribute(action.name);
        this.remember(el, () => {
          if (previous === null) el.removeAttribute(action.name);
          else el.setAttribute(action.name, previous);
        });
        el.setAttribute(action.name, action.value);
      } else if (action.type === 'class') {
        const el = element(action.target);
        if (!el) continue;
        const add = (action.add ?? []).filter((c) => !el.classList.contains(c));
        const remove = (action.remove ?? []).filter((c) => el.classList.contains(c));
        if (!add.length && !remove.length) continue;
        this.remember(el, () => {
          el.classList.remove(...add);
          el.classList.add(...remove);
        });
        el.classList.add(...add);
        el.classList.remove(...remove);
      }
    }
  }

  private remember(el: HTMLElement, restore: () => void): void {
    this.domUndo.push({ el, restore });
  }

  private async applyStorage(integration: Integration): Promise<boolean> {
    const journal = (await readJournal())[this.origin] ?? { entries: [] };
    let wrote = false;
    for (const action of integration.actions) {
      if (action.type !== 'localStorage' && action.type !== 'cookie') continue;
      const key = action.type === 'cookie' ? action.name : action.key;
      const current = action.type === 'cookie' ? readCookie(key) : readStorage(key);
      if (current === action.value) continue;
      if (!journal.entries.some((e) => e.kind === action.type && e.key === key)) {
        journal.entries.push({
          kind: action.type,
          key,
          previous: current,
          value: action.value,
          integration: integration.id,
          at: Date.now(),
        });
        // Record before writing, so a crash between the two never loses the old value.
        await writeOrigin(this.origin, journal);
      }
      if (action.type === 'cookie') writeCookie(key, action.value, action.days);
      else writeStorage(key, action.value);
      wrote = true;
    }
    return wrote;
  }

  /** Undoes DOM changes and restores every journaled value for this origin. True if storage changed. */
  async disable(): Promise<boolean> {
    clearTimeout(this.stopTimer);
    this.observer?.disconnect();
    this.observer = null;
    for (const undo of this.domUndo.reverse()) undo.restore();
    this.domUndo = [];
    this.active = null;
    return revertOrigin(this.origin);
  }
}

/** Restores journaled storage for the current origin. Safe to call when there is nothing to undo. */
export async function revertOrigin(origin: string): Promise<boolean> {
  const journal = (await readJournal())[origin];
  if (!journal?.entries.length) return false;
  for (const entry of journal.entries) {
    if (entry.kind === 'cookie') writeCookie(entry.key, entry.previous, 365);
    else writeStorage(entry.key, entry.previous);
  }
  await writeOrigin(origin, null);
  return true;
}

/**
 * Whether the page already shows a dark theme of its own. Must be called while none of
 * our styles apply (the caller suspends them for the duration of the call).
 */
export function pageLooksDark(): boolean {
  const meta = document
    .querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    ?.content.trim()
    .toLowerCase();
  if (meta === 'dark' || meta === 'only dark') return true;
  const bg = effectiveBackground(document.body) ?? effectiveBackground(document.documentElement);
  if (!bg) return false;
  return luminance(bg) < 0.12;
}

function effectiveBackground(
  el: Element | null,
): { r: number; g: number; b: number; a: number } | null {
  if (!el) return null;
  const c = parseColor(getComputedStyle(el).backgroundColor);
  return c && c.a > 0.9 ? c : null;
}
