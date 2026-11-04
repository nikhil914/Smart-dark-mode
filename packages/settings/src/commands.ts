import { type Settings, type ThemeId, BUILT_IN_THEME_IDS } from './schema';

/**
 * Commands from outside the extension (Shortcuts on Safari, via the host app). They arrive
 * as untrusted data: only known commands with valid values are kept.
 */
export type ExternalCommand =
  { type: 'enabled'; value: boolean } | { type: 'theme'; value: ThemeId };

const MAX_COMMANDS = 20;

export function parseExternalCommands(reply: unknown): ExternalCommand[] {
  if (typeof reply !== 'object' || reply === null) return [];
  const list = (reply as { commands?: unknown }).commands;
  if (!Array.isArray(list)) return [];
  const out: ExternalCommand[] = [];
  for (const raw of list.slice(0, MAX_COMMANDS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { type, value } = raw as Record<string, unknown>;
    if (type === 'enabled' && (value === 'true' || value === 'false')) {
      out.push({ type, value: value === 'true' });
    } else if (
      type === 'theme' &&
      typeof value === 'string' &&
      (BUILT_IN_THEME_IDS as readonly string[]).includes(value)
    ) {
      out.push({ type, value: value as ThemeId });
    }
  }
  return out;
}

/** Applies commands in order; later ones win. */
export function applyExternalCommands(
  settings: Settings,
  commands: readonly ExternalCommand[],
): Settings {
  let next = settings;
  for (const c of commands) {
    next = c.type === 'enabled' ? { ...next, enabled: c.value } : { ...next, theme: c.value };
  }
  return next;
}
