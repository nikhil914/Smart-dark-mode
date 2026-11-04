import { type ColorRole, type Theme, ensureContrast, formatColor, parseColor } from '../color';
import { COLOR_SHORTHANDS, roleForProperty } from './properties';
import { rewriteValue, varRoleName } from './value';
import type { VarRegistry } from './vars';

/** The parts of CSSOM we read. Duck-typed so the rewriter can be unit tested without a DOM. */
export interface StyleLike {
  readonly length: number;
  readonly [index: number]: string;
  getPropertyValue(property: string): string;
  getPropertyPriority(property: string): string;
}

export interface RuleLike {
  readonly cssText: string;
  readonly selectorText?: string;
  readonly style?: StyleLike;
  readonly cssRules?: ArrayLike<RuleLike>;
  readonly keyText?: string;
  readonly styleSheet?: { readonly cssRules: ArrayLike<RuleLike> } | null;
  readonly media?: { readonly mediaText: string };
}

export interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

export interface RewriteOptions {
  theme: Theme;
  vars: VarRegistry;
  /** Stylesheet URL, for resolving relative url() in copied declarations. */
  baseUrl?: string | undefined;
  onColor?: ((original: string, role: ColorRole) => void) | undefined;
}

function* declarations(style: StyleLike): Generator<Declaration> {
  const emptyLonghands = new Set<string>();
  for (let i = 0; i < style.length; i++) {
    const property = style[i]!;
    const value = style.getPropertyValue(property);
    if (!value) {
      emptyLonghands.add(property);
      continue;
    }
    yield { property, value, important: style.getPropertyPriority(property) === 'important' };
  }
  if (emptyLonghands.size === 0) return;
  // Longhands of a shorthand that contains var() come back empty; read the shorthand.
  for (const shorthand of COLOR_SHORTHANDS) {
    if (![...emptyLonghands].some((p) => p.startsWith(shorthand))) continue;
    const value = style.getPropertyValue(shorthand);
    if (value) {
      yield {
        property: shorthand,
        value,
        important: style.getPropertyPriority(shorthand) === 'important',
      };
    }
  }
}

function header(rule: RuleLike): string {
  const text = rule.cssText;
  const brace = text.indexOf('{');
  return brace === -1 ? '' : text.slice(0, brace).trim();
}

function isGrouping(rule: RuleLike): boolean {
  return (
    rule.cssRules !== undefined && rule.selectorText === undefined && rule.cssText.startsWith('@')
  );
}

/** Pass 1: record which roles each custom property is used in. */
export function scanUsage(rules: ArrayLike<RuleLike>, vars: VarRegistry): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.styleSheet) {
      safeRules(rule.styleSheet, (r) => scanUsage(r, vars));
      continue;
    }
    if (rule.style) {
      for (const d of declarations(rule.style)) {
        if (!d.value.includes('var(')) continue;
        const refs = [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!);
        if (d.property.startsWith('--')) {
          for (const ref of refs) vars.addAlias(ref, d.property);
        } else {
          const role = roleForProperty(d.property);
          if (role) for (const ref of refs) vars.addUsage(ref, role);
        }
      }
    }
    if (rule.cssRules) scanUsage(rule.cssRules, vars);
  }
}

function safeRules(
  sheet: { readonly cssRules: ArrayLike<RuleLike> },
  fn: (r: ArrayLike<RuleLike>) => void,
) {
  try {
    fn(sheet.cssRules);
  } catch {
    // Cross-origin @import: handled when the imported sheet is fetched on its own.
  }
}

/** Rewrites one declaration block. Returns the overriding declarations only. */
export function rewriteDeclarations(
  decls: Iterable<Declaration>,
  opts: RewriteOptions,
): Declaration[] {
  const out: Declaration[] = [];
  let bg: { index: number; value: string } | null = null;
  let fg: { index: number; value: string } | null = null;
  for (const d of decls) {
    if (d.property.startsWith('--')) {
      for (const role of opts.vars.rolesFor(d.property)) {
        const v = rewriteValue(d.value, role, {
          theme: opts.theme,
          rewriteVars: true,
          baseUrl: opts.baseUrl,
          onColor: opts.onColor,
        });
        if (v !== null) {
          out.push({ property: varRoleName(role, d.property), value: v, important: d.important });
        }
      }
      continue;
    }
    const role: ColorRole | null = roleForProperty(d.property);
    if (!role) continue;
    const v = rewriteValue(d.value, role, {
      theme: opts.theme,
      rewriteVars: true,
      baseUrl: opts.baseUrl,
      onColor: opts.onColor,
    });
    if (v === null) continue;
    out.push({ property: d.property, value: v, important: d.important });
    if (d.property === 'background-color') bg = { index: out.length - 1, value: v };
    if (d.property === 'color') fg = { index: out.length - 1, value: v };
  }
  // When a rule sets both text and background, we know the pair: enforce AA contrast.
  if (bg && fg) {
    const b = parseColor(bg.value);
    const f = parseColor(fg.value);
    if (b && f && b.a === 1)
      out[fg.index]!.value = formatColor(ensureContrast(f, b, opts.theme.minContrast));
  }
  return out;
}

function formatDecls(decls: Declaration[]): string {
  return decls
    .map((d) => `${d.property}: ${d.value}${d.important ? ' !important' : ''};`)
    .join(' ');
}

/** Pass 2: generates override CSS for a list of rules, keeping grouping rules and order. */
export function rewriteRules(rules: ArrayLike<RuleLike>, opts: RewriteOptions): string {
  const parts: string[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.styleSheet) {
      let inner = '';
      safeRules(rule.styleSheet, (r) => (inner = rewriteRules(r, opts)));
      if (!inner) continue;
      const media = rule.media?.mediaText;
      parts.push(media && media !== 'all' ? `@media ${media} { ${inner} }` : inner);
      continue;
    }
    if (rule.keyText !== undefined && rule.style) {
      const decls = rewriteDeclarations(declarations(rule.style), opts);
      if (decls.length) parts.push(`${rule.keyText} { ${formatDecls(decls)} }`);
      continue;
    }
    if (rule.selectorText !== undefined && rule.style) {
      const decls = rewriteDeclarations(declarations(rule.style), opts);
      const nested = rule.cssRules?.length ? rewriteRules(rule.cssRules, opts) : '';
      if (decls.length || nested) {
        parts.push(`${rule.selectorText} { ${formatDecls(decls)}${nested ? ` ${nested}` : ''} }`);
      }
      continue;
    }
    if (isGrouping(rule)) {
      const inner = rewriteRules(rule.cssRules!, opts);
      if (inner) parts.push(`${header(rule)} { ${inner} }`);
    }
  }
  return parts.join('\n');
}
