import { describe, expect, it } from 'vitest';
import { applyExternalCommands, defaultSettings, parseExternalCommands } from '../src';

describe('external commands', () => {
  it('keeps only known commands with valid values', () => {
    const parsed = parseExternalCommands({
      commands: [
        { type: 'enabled', value: 'false' },
        { type: 'theme', value: 'sepia' },
        { type: 'theme', value: 'custom:abc' },
        { type: 'theme', value: '<script>' },
        { type: 'enabled', value: true },
        { type: 'delete-everything' },
        null,
        'enabled',
      ],
    });
    expect(parsed).toEqual([
      { type: 'enabled', value: false },
      { type: 'theme', value: 'sepia' },
    ]);
  });

  it('ignores replies that are not command lists', () => {
    expect(parseExternalCommands(null)).toEqual([]);
    expect(parseExternalCommands({ ok: false })).toEqual([]);
    expect(parseExternalCommands({ commands: 'x' })).toEqual([]);
  });

  it('caps the number of commands', () => {
    const many = Array.from({ length: 100 }, () => ({ type: 'enabled', value: 'true' }));
    expect(parseExternalCommands({ commands: many })).toHaveLength(20);
  });

  it('applies commands in order', () => {
    const s = defaultSettings();
    const next = applyExternalCommands(s, [
      { type: 'enabled', value: false },
      { type: 'theme', value: 'amoled' },
      { type: 'enabled', value: true },
    ]);
    expect(next.enabled).toBe(true);
    expect(next.theme).toBe('amoled');
    expect(s.theme).toBe('dark');
  });
});
