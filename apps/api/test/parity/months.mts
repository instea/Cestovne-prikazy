/**
 * MIG-03 request set: every (year, month) from the month of the earliest
 * leave `startDate` to the current month + 1, plus edge requests
 * `YYYY/0`, `YYYY/13`, `YYYY/1.5` (current year), `Infinity/1`, `abc/1`,
 * `2024/abc`, and (extension) `1e20/3`, a finite year outside the JS Date
 * range that the new app also rejects with 400.
 */

export type RequestKind =
  /** A plain calendar month. */
  | 'month'
  /** Finite numeric params that normalize to another month (old quirk). */
  | 'overflow'
  /** Non-finite, or finite but outside the JS Date range. */
  | 'non-finite'
  /** Not a number at all (`abc`): both apps answer 400. */
  | 'invalid';

export interface ParityRequest {
  /** Raw path params as sent. */
  year: string;
  month: string;
  kind: RequestKind;
  /** Effective month (ATT-01 normalization), `null` for non-finite/invalid. */
  effective: { year: number; month: number } | null;
  /** Leave codes are written (raw month is an integer 1–12). */
  leaveCodes: boolean;
}

export const monthKey = (year: number, month: number): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

const fitsDate = (year: number, month: number) =>
  Number.isFinite(Date.UTC(year, month - 1, 1)) &&
  Number.isFinite(Date.UTC(year, month, 0));

/** ATT-01 normalization, re-implemented as an independent check. */
export function normalize(
  year: string,
  month: string,
): Omit<ParityRequest, 'year' | 'month'> {
  const m = Number(month);
  const y = Number(year);
  if (Number.isNaN(m) || Number.isNaN(y))
    return { kind: 'invalid', effective: null, leaveCodes: false };
  if (!Number.isFinite(m) || !Number.isFinite(y))
    return { kind: 'non-finite', effective: null, leaveCodes: false };
  const mi = Math.trunc(m - 1);
  const ey = Math.trunc(y) + Math.floor(mi / 12);
  const em = (((mi % 12) + 12) % 12) + 1;
  if (!fitsDate(Math.trunc(y), 1) || !fitsDate(ey, em))
    return { kind: 'non-finite', effective: null, leaveCodes: false };
  const leaveCodes = Number.isInteger(m) && m >= 1 && m <= 12;
  return {
    kind: leaveCodes && Number.isInteger(y) ? 'month' : 'overflow',
    effective: { year: ey, month: em },
    leaveCodes,
  };
}

export function request(year: string, month: string): ParityRequest {
  return { year, month, ...normalize(year, month) };
}

/**
 * The spec's month set. `earliestLeave` is a `YYYY-MM-DD` start date (or
 * `null` for a dataset without leaves: then only the current and next month).
 */
export function parityRequests(
  earliestLeave: string | null,
  now: Date,
): ParityRequest[] {
  const currentYear = now.getUTCFullYear();
  const current = currentYear * 12 + now.getUTCMonth(); // month index
  const last = current + 1;
  let first = current;
  if (earliestLeave) {
    const [y, m] = earliestLeave.split('-').map(Number) as [number, number];
    first = Math.min(first, y * 12 + (m - 1));
  }
  const out: ParityRequest[] = [];
  for (let i = first; i <= last; i++)
    out.push(request(String(Math.floor(i / 12)), String((i % 12) + 1)));
  const y = String(currentYear);
  for (const [ry, rm] of [
    [y, '0'],
    [y, '13'],
    [y, '1.5'],
    ['Infinity', '1'],
    ['1e20', '3'],
    ['abc', '1'],
    ['2024', 'abc'],
  ] as const)
    out.push(request(ry, rm));
  return out;
}

/** Effective months of the requests (for fixture generation). */
export function effectiveMonths(
  requests: readonly ParityRequest[],
): { year: number; month: number }[] {
  const seen = new Map<string, { year: number; month: number }>();
  for (const r of requests)
    if (r.effective)
      seen.set(monthKey(r.effective.year, r.effective.month), r.effective);
  return [...seen.values()];
}

/** `YYYY-MM-DD` of each day of the month. */
export function daysOf(year: number, month: number): string[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length: n },
    (_, i) => `${monthKey(year, month)}-${String(i + 1).padStart(2, '0')}`,
  );
}
