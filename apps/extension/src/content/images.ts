/**
 * Finds small dark icons and logos on transparent backgrounds, which disappear on a
 * dark page, and marks them for inversion. Photos and large images are never touched.
 * Work runs lazily: only for images that become visible, during idle time.
 */

const SAMPLE = 32;
const MAX_ICON_SIZE = 96;

type Verdict = 'invert' | 'keep';

const cache = new Map<string, Verdict>();

function classify(img: HTMLImageElement): Verdict | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const shown = img.getBoundingClientRect();
  if (Math.max(shown.width, shown.height) > MAX_ICON_SIZE && Math.max(w, h) > MAX_ICON_SIZE * 2) {
    return 'keep';
  }
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } catch {
    // Cross-origin image without CORS: the canvas is tainted. Leave it alone.
    return 'keep';
  }
  let transparent = 0;
  let dark = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 30) {
      transparent++;
      continue;
    }
    opaque++;
    const l = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
    if (l < 0.3) dark++;
  }
  const total = SAMPLE * SAMPLE;
  // A dark glyph on a transparent background: invert so it shows on dark pages.
  if (transparent / total > 0.25 && opaque > 0 && dark / opaque > 0.7) return 'invert';
  return 'keep';
}

export class ImageClassifier {
  private readonly io: IntersectionObserver;
  private readonly pending = new Set<HTMLImageElement>();
  private idle = 0;
  private readonly marked = new Set<Element>();

  constructor() {
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this.io.unobserve(e.target);
        this.pending.add(e.target as HTMLImageElement);
      }
      this.schedule();
    });
  }

  observe(root: ParentNode): void {
    for (const img of root.querySelectorAll('img')) this.io.observe(img);
  }

  observeOne(img: HTMLImageElement): void {
    this.io.observe(img);
  }

  stop(): void {
    this.io.disconnect();
    cancelIdle(this.idle);
    for (const el of this.marked) el.removeAttribute('data-sdm-img');
    this.marked.clear();
  }

  private schedule(): void {
    if (this.idle || !this.pending.size) return;
    this.idle = requestIdle(() => this.run());
  }

  private run(): void {
    this.idle = 0;
    const deadline = performance.now() + 10;
    for (const img of this.pending) {
      if (performance.now() > deadline) break;
      this.pending.delete(img);
      if (!img.complete) {
        img.addEventListener('load', () => this.observeOne(img), { once: true });
        continue;
      }
      const key = img.currentSrc || img.src;
      let verdict = cache.get(key);
      if (!verdict) {
        const v = classify(img);
        if (!v) continue;
        verdict = v;
        if (cache.size > 2000) cache.clear();
        cache.set(key, verdict);
      }
      if (verdict === 'invert') {
        img.setAttribute('data-sdm-img', 'invert');
        this.marked.add(img);
      }
    }
    this.schedule();
  }
}

function requestIdle(fn: () => void): number {
  return typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 500 })
    : (setTimeout(fn, 50) as unknown as number);
}

function cancelIdle(id: number): void {
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
  else clearTimeout(id);
}
