import type { ColorRole } from '../color';
import { guessRoleFromName } from './properties';

/**
 * Tracks which colour roles each custom property is used in, so a variable's
 * declaration can be split into role-specific twins (--sdm-background--x, --sdm-text--x).
 */
export class VarRegistry {
  private readonly direct = new Map<string, Set<ColorRole>>();
  /** b -> {a, ...} when `--a: ... var(--b) ...`, so roles of a flow into b. */
  private readonly referencedBy = new Map<string, Set<string>>();
  /** Bumped whenever a variable gains a role it did not have, so callers can re-render. */
  version = 0;

  addUsage(name: string, role: ColorRole): void {
    let set = this.direct.get(name);
    if (!set) this.direct.set(name, (set = new Set()));
    if (!set.has(role)) {
      set.add(role);
      this.version++;
    }
  }

  addAlias(referenced: string, by: string): void {
    if (referenced === by) return;
    let set = this.referencedBy.get(referenced);
    if (!set) this.referencedBy.set(referenced, (set = new Set()));
    if (!set.has(by)) {
      set.add(by);
      this.version++;
    }
  }

  rolesFor(name: string): Set<ColorRole> {
    const out = new Set<ColorRole>();
    const seen = new Set<string>();
    const visit = (n: string) => {
      if (seen.has(n) || seen.size > 64) return;
      seen.add(n);
      this.direct.get(n)?.forEach((r) => out.add(r));
      this.referencedBy.get(n)?.forEach(visit);
    };
    visit(name);
    if (out.size === 0) {
      const guess = guessRoleFromName(name);
      if (guess) out.add(guess);
    }
    return out;
  }
}
