/**
 * Detects pages that rewrite their own styles in a loop (F7). A node re-rendered too often
 * is paused; too many renders overall switch the page to simplified mode, which stops
 * watching inline styles and only converts stylesheets.
 */
export class RunawayGuard {
  private readonly perNode = new WeakMap<
    object,
    { count: number; since: number; pausedUntil: number }
  >();
  private total = 0;
  private windowStart = performance.now();
  simplified = false;
  notified = false;

  constructor(
    private readonly perNodeLimit = 15,
    private readonly totalLimit = 3000,
    private readonly windowMs = 1000,
  ) {}

  allow(node: object): boolean {
    const now = performance.now();
    if (now - this.windowStart > this.windowMs) {
      this.windowStart = now;
      this.total = 0;
    }
    if (++this.total > this.totalLimit) this.simplified = true;

    let entry = this.perNode.get(node);
    if (!entry) this.perNode.set(node, (entry = { count: 0, since: now, pausedUntil: 0 }));
    if (now < entry.pausedUntil) return false;
    if (now - entry.since > this.windowMs) {
      entry.since = now;
      entry.count = 0;
    }
    if (++entry.count > this.perNodeLimit) {
      entry.pausedUntil = now + 5000;
      return false;
    }
    return true;
  }
}
