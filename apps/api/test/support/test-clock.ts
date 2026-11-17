import type { Clock } from '../../src/common/clock';

/** Default start: a Monday morning in winter (CET), far from DST switches. */
export const TEST_CLOCK_START = '2026-12-21T08:00:00.000Z';

/**
 * Controllable `Clock` for integration tests (TST-02). Time stands still
 * until a test calls `set` / `advance`.
 */
export class TestClock implements Clock {
  private ms: number;

  constructor(start: Date | string = TEST_CLOCK_START) {
    this.ms = TestClock.toMs(start);
  }

  now(): Date {
    return new Date(this.ms);
  }

  set(instant: Date | string): void {
    this.ms = TestClock.toMs(instant);
  }

  advance(ms: number): void {
    this.ms += ms;
  }

  private static toMs(instant: Date | string): number {
    const ms = new Date(instant).getTime();
    if (Number.isNaN(ms))
      throw new Error(`TestClock: invalid date ${String(instant)}`);
    return ms;
  }
}
