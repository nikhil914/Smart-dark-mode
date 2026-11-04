import { describe, expect, it } from 'vitest';
import { automationActive, defaultSettings, inWindow, nextBoundary, parseTime } from '../src';

function time(h: number, m = 0): Date {
  return new Date(2026, 10, 4, h, m, 30);
}

describe('schedule', () => {
  it('parses HH:MM and rejects junk', () => {
    expect(parseTime('07:05')).toBe(425);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('7:5')).toBeNull();
  });

  it('handles a same-day window', () => {
    expect(inWindow(time(9), '08:00', '17:00')).toBe(true);
    expect(inWindow(time(17), '08:00', '17:00')).toBe(false);
    expect(inWindow(time(7, 59), '08:00', '17:00')).toBe(false);
  });

  it('handles an overnight window', () => {
    expect(inWindow(time(23), '19:00', '07:00')).toBe(true);
    expect(inWindow(time(3), '19:00', '07:00')).toBe(true);
    expect(inWindow(time(12), '19:00', '07:00')).toBe(false);
  });

  it('treats an empty window as always on', () => {
    expect(inWindow(time(12), '10:00', '10:00')).toBe(true);
  });

  it('finds the next boundary, including across midnight', () => {
    expect(nextBoundary(time(12), '19:00', '07:00')?.getHours()).toBe(19);
    const next = nextBoundary(time(20), '19:00', '07:00');
    expect(next?.getHours()).toBe(7);
    expect(next?.getDate()).toBe(5);
  });

  it('automation kinds', () => {
    const s = defaultSettings();
    expect(automationActive(s, time(12), false)).toBe(true);
    s.automation.kind = 'system';
    expect(automationActive(s, time(12), false)).toBe(false);
    expect(automationActive(s, time(12), true)).toBe(true);
    s.automation.kind = 'schedule';
    expect(automationActive(s, time(12), true)).toBe(false);
    expect(automationActive(s, time(22), false)).toBe(true);
  });
});
