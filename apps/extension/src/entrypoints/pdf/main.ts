import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { type PdfStyle, type Settings, normalizeHex } from '@sdm/settings';
import { applyDocumentLocale, t } from '@/lib/i18n';
import type { PdfOriginalRequest } from '@/lib/messages';
import { loadSettings, saveSettings } from '@/lib/settings-store';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const PRESETS: Partial<Record<PdfStyle, { background: string; foreground: string }>> = {
  dark: { background: '#1e1e1e', foreground: '#e0e0e0' },
  sepia: { background: '#f4ecd8', foreground: '#5b4636' },
};

/** The PDF address, from `?file=`. The background redirect passes it unencoded. */
function fileUrl(): string | null {
  const search = location.search;
  const at = search.indexOf('file=');
  if (at === -1) return null;
  let raw = search.slice(at + 5);
  if (/^[a-z][\w+.-]*%3a/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return /^(https?|file):/i.test(raw) ? raw : null;
}

interface PageView {
  index: number;
  el: HTMLDivElement;
  page: PDFPageProxy | null;
  renderedKey: string;
  text: string | null;
}

class Viewer {
  private doc: PDFDocumentProxy | null = null;
  private views: PageView[] = [];
  private scale = 1;
  private style: PdfStyle = 'dark';
  private custom = { background: '#1e1e1e', foreground: '#e0e0e0' };
  private settings: Settings | null = null;
  private observer = new IntersectionObserver((entries) => this.onVisible(entries), {
    rootMargin: '800px 0px',
  });
  private visible = new Set<number>();
  private matches: number[] = [];
  private matchAt = -1;
  private query = '';

  constructor(private readonly url: string) {}

  async open(): Promise<void> {
    this.settings = await loadSettings();
    this.style = this.settings.pdf.style;
    this.custom = { background: this.settings.pdf.background, foreground: this.settings.pdf.text };
    this.syncControls();
    $('title').textContent = decodeURIComponent(this.url.split(/[?#]/)[0]!.split('/').pop() ?? '');
    document.title = $('title').textContent || 'PDF';
    try {
      this.doc = await pdfjs.getDocument({
        url: this.url,
        withCredentials: true,
        standardFontDataUrl: browser.runtime.getURL('/pdfjs/standard_fonts/' as never),
        wasmUrl: browser.runtime.getURL('/pdfjs/wasm/' as never),
      }).promise;
    } catch {
      this.status(this.url.startsWith('file:') ? t('pdfFileAccess') : t('pdfLoadFailed'));
      return;
    }
    const meta = await this.doc.getMetadata().catch(() => null);
    const title = (meta?.info as { Title?: unknown } | undefined)?.Title;
    if (typeof title === 'string' && title.trim()) document.title = title.trim();

    const first = await this.doc.getPage(1);
    const width = first.getViewport({ scale: 1 }).width;
    this.scale = Math.min(2, Math.max(0.5, (document.body.clientWidth - 48) / width));
    this.layout();
  }

  private status(text: string): void {
    $('status').textContent = text;
  }

  private layout(): void {
    if (!this.doc) return;
    const container = $('pages');
    container.textContent = '';
    this.observer.disconnect();
    this.views = [];
    for (let i = 1; i <= this.doc.numPages; i++) {
      const el = document.createElement('div');
      el.className = 'page';
      el.dataset.index = String(i);
      el.setAttribute('aria-label', t('pageN', String(i)));
      container.append(el);
      this.views.push({ index: i, el, page: null, renderedKey: '', text: null });
      this.observer.observe(el);
    }
    void this.sizePages();
    $('zoom').textContent = `${Math.round(this.scale * 100)}%`;
  }

  /** Gives every page its final size up front so scrolling and search jumps are stable. */
  private async sizePages(): Promise<void> {
    for (const view of this.views) {
      view.page ??= await this.doc!.getPage(view.index);
      const vp = view.page.getViewport({ scale: this.scale });
      view.el.style.width = `${vp.width}px`;
      view.el.style.height = `${vp.height}px`;
    }
  }

  private onVisible(entries: IntersectionObserverEntry[]): void {
    for (const e of entries) {
      const index = Number((e.target as HTMLElement).dataset.index);
      if (e.isIntersecting) this.visible.add(index);
      else this.visible.delete(index);
    }
    void this.renderVisible();
  }

  private renderKey(): string {
    return `${this.scale}|${this.style}|${this.custom.background}|${this.custom.foreground}|${this.query}`;
  }

  private async renderVisible(): Promise<void> {
    for (const index of [...this.visible].sort((a, b) => a - b)) {
      const view = this.views[index - 1];
      if (view) await this.renderPage(view);
    }
  }

  private pageColors(): { background: string; foreground: string } | null {
    if (this.style === 'custom') return this.custom;
    return PRESETS[this.style] ?? null;
  }

  private async renderPage(view: PageView): Promise<void> {
    const key = this.renderKey();
    if (view.renderedKey === key) return;
    view.renderedKey = key;
    view.page ??= await this.doc!.getPage(view.index);
    const viewport = view.page.getViewport({ scale: this.scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    if (this.style === 'invert') canvas.className = 'invert';
    const colours = this.pageColors();
    await view.page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      ...(colours ? { pageColors: colours } : {}),
    }).promise;
    if (view.renderedKey !== key) return;

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.setProperty('--total-scale-factor', String(this.scale));
    await new pdfjs.TextLayer({
      textContentSource: view.page.streamTextContent(),
      container: textLayer,
      viewport,
    }).render();
    if (this.query) this.highlight(textLayer);
    if (view.renderedKey !== key) return;
    view.el.replaceChildren(canvas, textLayer);
    view.el.style.background =
      colours?.background ?? (this.style === 'invert' ? '#1a1a1a' : '#fff');
  }

  private highlight(layer: HTMLElement): void {
    const q = this.query.toLowerCase();
    for (const span of layer.querySelectorAll('span')) {
      if (span.textContent?.toLowerCase().includes(q)) span.classList.add('highlight');
    }
  }

  private rerender(): void {
    for (const view of this.views) view.renderedKey = '';
    void this.renderVisible();
  }

  setStyle(style: PdfStyle): void {
    this.style = style;
    this.syncControls();
    void this.persist();
    this.rerender();
  }

  setCustom(part: 'background' | 'foreground', value: string): void {
    const hex = normalizeHex(value);
    if (!hex) return;
    this.custom = { ...this.custom, [part]: hex };
    void this.persist();
    this.rerender();
  }

  private async persist(): Promise<void> {
    const current = await loadSettings();
    this.settings = {
      ...current,
      pdf: {
        ...current.pdf,
        style: this.style,
        background: this.custom.background,
        text: this.custom.foreground,
      },
    };
    await saveSettings(this.settings);
  }

  private syncControls(): void {
    ($('style') as HTMLSelectElement).value = this.style;
    $('custom').hidden = this.style !== 'custom';
    ($('bg') as HTMLInputElement).value = this.custom.background;
    ($('fg') as HTMLInputElement).value = this.custom.foreground;
  }

  zoom(delta: number): void {
    const anchor = window.scrollY / Math.max(1, document.body.scrollHeight);
    this.scale = Math.min(4, Math.max(0.25, Math.round((this.scale + delta) * 100) / 100));
    $('zoom').textContent = `${Math.round(this.scale * 100)}%`;
    void this.sizePages().then(() => {
      window.scrollTo(0, anchor * document.body.scrollHeight);
      this.rerender();
    });
  }

  async search(query: string, step: 1 | -1): Promise<void> {
    if (!this.doc) return;
    const q = query.trim();
    if (q !== this.query) {
      this.query = q;
      this.matches = [];
      this.matchAt = -1;
      if (q) {
        const needle = q.toLowerCase();
        for (const view of this.views) {
          if (view.text === null) {
            view.page ??= await this.doc.getPage(view.index);
            const content = await view.page.getTextContent();
            view.text = content.items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ')
              .toLowerCase();
          }
          if (view.text.includes(needle)) this.matches.push(view.index);
        }
      }
      this.rerender();
    }
    if (!this.matches.length) {
      $('matches').textContent = q ? t('noMatches') : '';
      return;
    }
    this.matchAt = (this.matchAt + step + this.matches.length) % this.matches.length;
    const page = this.matches[this.matchAt]!;
    $('matches').textContent = t('matchPages', [
      String(this.matchAt + 1),
      String(this.matches.length),
    ]);
    this.views[page - 1]?.el.scrollIntoView({ block: 'start' });
  }

  /** Prints every page in its original colours, whatever the screen style is. */
  async print(): Promise<void> {
    if (!this.doc) return;
    const out = $('print-pages');
    out.textContent = '';
    for (const view of this.views) {
      this.status(t('preparingPrint', [String(view.index), String(this.views.length)]));
      view.page ??= await this.doc.getPage(view.index);
      const viewport = view.page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await view.page.render({ canvas, viewport, intent: 'print' }).promise;
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.alt = '';
      out.append(img);
    }
    this.status('');
    window.addEventListener('afterprint', () => (out.textContent = ''), { once: true });
    window.print();
  }

  async openOriginal(): Promise<void> {
    const target = `${this.url.split('#')[0]}#sdm-original`;
    if (/^https?:/i.test(this.url)) {
      const request: PdfOriginalRequest = {
        type: 'sdm:pdf-original',
        url: this.url.split('#')[0]!,
      };
      await browser.runtime.sendMessage(request).catch(() => undefined);
    }
    location.replace(target);
  }
}

applyDocumentLocale();
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  el.textContent = t(el.dataset.i18n!);
}
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
  el.setAttribute('aria-label', t(el.dataset.i18nLabel!));
  el.title = t(el.dataset.i18nLabel!);
}
for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
  el.placeholder = t(el.dataset.i18nPlaceholder!);
}

const url = fileUrl();
if (!url) {
  $('status').textContent = t('pdfLoadFailed');
} else {
  const viewer = new Viewer(url);
  void viewer.open();
  $('style').addEventListener('change', (e) =>
    viewer.setStyle((e.target as HTMLSelectElement).value as PdfStyle),
  );
  $('bg').addEventListener('input', (e) =>
    viewer.setCustom('background', (e.target as HTMLInputElement).value),
  );
  $('fg').addEventListener('input', (e) =>
    viewer.setCustom('foreground', (e.target as HTMLInputElement).value),
  );
  $('zoom-in').addEventListener('click', () => viewer.zoom(0.1));
  $('zoom-out').addEventListener('click', () => viewer.zoom(-0.1));
  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    void viewer.search(($('query') as HTMLInputElement).value, 1);
  });
  $('prev').addEventListener(
    'click',
    () => void viewer.search(($('query') as HTMLInputElement).value, -1),
  );
  $('print').addEventListener('click', () => void viewer.print());
  $('original').addEventListener('click', () => void viewer.openOriginal());
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      void viewer.print();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('query').focus();
    }
  });
}
