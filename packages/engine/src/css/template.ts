import { type ColorRole, type Theme, modifyColorValue } from '../color';
import { roleForProperty } from './properties';

const TEMPLATE = /\$\{([^}]{1,100})\}/g;
const DECLARATION = /([\w-]+)(\s*:\s*)((?:[^;{}$]|\$\{[^}]*\}|\$)*)/g;

/**
 * Expands `${colour}` templates in user CSS, the same syntax Dark Reader's fixes use:
 * `color: ${#333}` becomes the colour #333 turns into on a dark page. The role comes from
 * the declaration's property; anything that is not a colour property is treated as a
 * background. Templates that are not colours are left as written.
 */
export function expandTemplates(css: string, theme: Theme | null): string {
  if (!css.includes('${')) return css;
  return css.replace(DECLARATION, (whole, property: string, sep: string, value: string) => {
    if (!value.includes('${')) return whole;
    const role: ColorRole = roleForProperty(property.toLowerCase()) ?? 'background';
    const expanded = value.replace(TEMPLATE, (template, inner: string) => {
      const colour = inner.trim();
      if (!theme) return colour;
      return modifyColorValue(colour, role, theme) ?? template;
    });
    return `${property}${sep}${expanded}`;
  });
}
