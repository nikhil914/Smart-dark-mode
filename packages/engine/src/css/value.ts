import {
  type ColorRole,
  type Theme,
  NAMED_COLORS,
  SYSTEM_COLORS,
  modifyColorValue,
} from '../color';

const COLOR_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
]);

function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    } else if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, i + 1);
      if (end === -1) return -1;
      i = end;
    }
  }
  return -1;
}

export function varRoleName(role: ColorRole, name: string): string {
  return `--sdm-${role}${name}`;
}

export interface ValueContext {
  theme: Theme;
  /** Called for each var(--x) reference so the caller can record usage. */
  onVar?: (name: string) => void;
  /** Rewrite var(--x) into its role-specific twin. */
  rewriteVars: boolean;
  /** Base for relative url() values, so a copied declaration still points at the same file. */
  baseUrl?: string | undefined;
}

function absolutizeUrl(fn: string, baseUrl: string | undefined): string {
  if (!baseUrl) return fn;
  const m = /^url\(\s*(['"]?)(.*?)\1\s*\)$/is.exec(fn);
  if (!m) return fn;
  const raw = m[2]!;
  if (/^(data:|#|[a-z][\w+.-]*:\/\/)/i.test(raw)) return fn;
  try {
    return `url(${JSON.stringify(new URL(raw, baseUrl).href)})`;
  } catch {
    return fn;
  }
}

/**
 * Rewrites every colour token in a CSS value for `role`, leaving everything else
 * (urls, numbers, keywords) byte for byte. Returns null when nothing changed.
 */
export function rewriteValue(value: string, role: ColorRole, ctx: ValueContext): string | null {
  let out = '';
  let changed = false;
  let i = 0;
  const n = value.length;
  while (i < n) {
    const ch = value[i]!;
    if (ch === '#') {
      const m = /^#[0-9a-fA-F]{3,8}(?![\w-])/.exec(value.slice(i));
      if (m) {
        const mod = modifyColorValue(m[0], role, ctx.theme);
        if (mod) {
          out += mod;
          changed = true;
          i += m[0].length;
          continue;
        }
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = value.indexOf(ch, i + 1);
      const stop = end === -1 ? n : end + 1;
      out += value.slice(i, stop);
      i = stop;
      continue;
    }
    if (/[a-zA-Z_-]/.test(ch) && (i === 0 || !/[\w-]/.test(value[i - 1]!))) {
      const m = /^[a-zA-Z_-][\w-]*/.exec(value.slice(i))!;
      const word = m[0];
      const lower = word.toLowerCase();
      const next = i + word.length;
      if (value[next] === '(') {
        const close = closingParen(value, next);
        if (close === -1) {
          out += value.slice(i);
          break;
        }
        const whole = value.slice(i, close + 1);
        if (lower === 'url') {
          out += absolutizeUrl(whole, ctx.baseUrl);
        } else if (lower === 'image-set' || lower === 'env' || lower === 'attr') {
          out += whole;
        } else if (lower === 'var') {
          const res = rewriteVar(value.slice(next + 1, close), role, ctx);
          if (res !== null) changed = true;
          out += res ?? whole;
        } else if (COLOR_FUNCTIONS.has(lower)) {
          const mod = modifyColorValue(whole, role, ctx.theme);
          if (mod) {
            out += mod;
            changed = true;
          } else {
            // Relative colours or colours built from var(): rewrite what we can inside.
            const inner = rewriteValue(value.slice(next + 1, close), role, ctx);
            if (inner !== null) changed = true;
            out += `${word}(${inner ?? value.slice(next + 1, close)})`;
          }
        } else {
          const inner = rewriteValue(value.slice(next + 1, close), role, ctx);
          if (inner !== null) changed = true;
          out += `${word}(${inner ?? value.slice(next + 1, close)})`;
        }
        i = close + 1;
        continue;
      }
      if (lower in NAMED_COLORS || lower in SYSTEM_COLORS || lower === 'transparent') {
        const mod = lower === 'transparent' ? null : modifyColorValue(lower, role, ctx.theme);
        if (mod) {
          out += mod;
          changed = true;
        } else out += word;
      } else out += word;
      i = next;
      continue;
    }
    out += ch;
    i++;
  }
  return changed ? out : null;
}

function rewriteVar(body: string, role: ColorRole, ctx: ValueContext): string | null {
  const comma = body.indexOf(',');
  const name = (comma === -1 ? body : body.slice(0, comma)).trim();
  if (!name.startsWith('--')) return null;
  ctx.onVar?.(name);
  const fallback = comma === -1 ? undefined : body.slice(comma + 1);
  const newFallback =
    fallback === undefined ? undefined : (rewriteValue(fallback, role, ctx) ?? fallback);
  if (!ctx.rewriteVars) {
    return newFallback !== undefined && newFallback !== fallback
      ? `var(${name},${newFallback})`
      : null;
  }
  const original = fallback === undefined ? `var(${name})` : `var(${name},${fallback})`;
  const tail = newFallback === undefined ? original : `var(${name},${newFallback})`;
  return `var(${varRoleName(role, name)}, ${tail})`;
}
