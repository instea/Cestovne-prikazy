import { describe, expect, it } from 'vitest';
import {
  daysOf,
  effectiveMonths,
  normalize,
  parityRequests,
} from './months.mts';

describe('parity month set (MIG-03)', () => {
  it('runs from the earliest leave month to the current month + 1, plus edge requests', () => {
    const reqs = parityRequests('2024-01-15', new Date('2026-11-06T10:00:00Z'));
    const plain = reqs.filter((r) => r.kind === 'month');
    expect(plain[0]).toMatchObject({ year: '2024', month: '1' });
    expect(plain.at(-1)).toMatchObject({ year: '2026', month: '12' });
    expect(plain).toHaveLength(36);
    expect(reqs.slice(36).map((r) => `${r.year}/${r.month}`)).toEqual([
      '2026/0',
      '2026/13',
      '2026/1.5',
      'Infinity/1',
      '1e20/3',
      'abc/1',
      '2024/abc',
    ]);
  });

  it('without leaves covers the current and next month', () => {
    const reqs = parityRequests(null, new Date('2026-12-15T10:00:00Z'));
    expect(
      reqs.filter((r) => r.kind === 'month').map((r) => `${r.year}/${r.month}`),
    ).toEqual(['2026/12', '2027/1']);
  });

  it.each([
    ['2024', '3', 'month', { year: 2024, month: 3 }, true],
    ['2026', '0', 'overflow', { year: 2025, month: 12 }, false],
    ['2026', '13', 'overflow', { year: 2027, month: 1 }, false],
    ['2026', '1.5', 'overflow', { year: 2026, month: 1 }, false],
    ['2024', '-1', 'overflow', { year: 2023, month: 11 }, false],
    ['Infinity', '1', 'non-finite', null, false],
    ['1e20', '3', 'non-finite', null, false],
    ['2024', '1e300', 'non-finite', null, false],
    ['abc', '1', 'invalid', null, false],
    ['2024', 'abc', 'invalid', null, false],
  ] as const)('%s/%s → %s', (y, m, kind, effective, leaveCodes) => {
    expect(normalize(y, m)).toEqual({ kind, effective, leaveCodes });
  });

  it('effectiveMonths deduplicates normalized months', () => {
    const reqs = parityRequests('2025-12-01', new Date('2026-01-10T00:00:00Z'));
    expect(effectiveMonths(reqs).map((m) => `${m.year}-${m.month}`)).toEqual([
      '2025-12',
      '2026-1',
      '2026-2',
      '2027-1',
    ]);
  });

  it('daysOf lists every day of the month', () => {
    expect(daysOf(2024, 2)).toHaveLength(29);
    expect(daysOf(2025, 2).at(-1)).toBe('2025-02-28');
  });
});
