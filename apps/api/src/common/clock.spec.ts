import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from './clock';

describe('systemClock', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the current time as a new Date each call', () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00Z') });
    const a = systemClock.now();
    expect(a.toISOString()).toBe('2026-03-01T10:00:00.000Z');
    vi.setSystemTime(new Date('2026-03-01T10:00:05Z'));
    expect(systemClock.now().toISOString()).toBe('2026-03-01T10:00:05.000Z');
    expect(systemClock.now()).not.toBe(systemClock.now());
  });
});
