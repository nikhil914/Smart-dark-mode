import type { ColorRole } from '../color';

/** Which colour role each colour-bearing property uses. */
const ROLE_BY_PROPERTY: Record<string, ColorRole> = {
  'background-color': 'background',
  background: 'background',
  'background-image': 'background',
  color: 'text',
  'caret-color': 'text',
  'text-decoration-color': 'text',
  'text-emphasis-color': 'text',
  '-webkit-text-fill-color': 'text',
  '-webkit-text-stroke-color': 'text',
  fill: 'text',
  stroke: 'text',
  'flood-color': 'background',
  'stop-color': 'background',
  'lighting-color': 'background',
  'outline-color': 'border',
  outline: 'border',
  'column-rule-color': 'border',
  'column-rule': 'border',
  'box-shadow': 'shadow',
  'text-shadow': 'shadow',
};

export function roleForProperty(property: string): ColorRole | null {
  const direct = ROLE_BY_PROPERTY[property];
  if (direct) return direct;
  if (
    property.startsWith('border') &&
    (property.endsWith('color') || !property.includes('radius'))
  ) {
    if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(property)) {
      return 'border';
    }
  }
  return null;
}

/** Shorthands whose longhands come back empty from CSSOM when the value contains var(). */
export const COLOR_SHORTHANDS = [
  'background',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-block',
  'border-inline',
  'outline',
  'column-rule',
] as const;

/** Name-based guess for a custom property's role when no usage has been seen. */
export function guessRoleFromName(name: string): ColorRole | null {
  const n = name.toLowerCase();
  if (
    /(^|[-_])(bg|background|surface|canvas|fill|backdrop|base|paper|card|panel)([-_]|$)/.test(n)
  ) {
    return 'background';
  }
  if (/(^|[-_])(text|fg|foreground|font|ink|heading|link|on)([-_]|$)/.test(n)) return 'text';
  if (/(^|[-_])(border|outline|divider|separator|stroke|line|rule)([-_]|$)/.test(n))
    return 'border';
  if (/(^|[-_])shadow([-_]|$)/.test(n)) return 'shadow';
  return null;
}
