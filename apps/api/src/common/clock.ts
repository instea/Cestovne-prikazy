/**
 * Source of "now" for time-dependent rules (TST-01 / TST-02). Inject `CLOCK`
 * instead of calling `new Date()` / `Date.now()` so integration tests can
 * replace it with the controllable `TestClock` (`apps/api/test/support`).
 */
export interface Clock {
  /** Current instant; a new `Date` each call. */
  now(): Date;
}

/** Injection token for the `Clock` (global, see `ClockModule`). */
export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
