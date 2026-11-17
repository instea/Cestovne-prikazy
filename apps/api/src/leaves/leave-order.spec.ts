import { describe, expect, it } from 'vitest';
import { compareLeavesForList } from './leave-order';

const leave = (id: string, startDate: string, createdAt: string) => ({
  id,
  startDate,
  createdAt: new Date(createdAt),
});

describe('compareLeavesForList (LST-01)', () => {
  it('sorts by startDate descending', () => {
    const list = [
      leave('a', '2026-01-10', '2026-01-01T00:00:00Z'),
      leave('b', '2026-03-01', '2026-01-01T00:00:00Z'),
      leave('c', '2025-12-30', '2026-01-01T00:00:00Z'),
    ].sort(compareLeavesForList);
    expect(list.map((l) => l.startDate)).toEqual([
      '2026-03-01',
      '2026-01-10',
      '2025-12-30',
    ]);
  });

  it('then by createdAt descending, then by id ascending', () => {
    const list = [
      leave('b', '2026-03-01', '2026-01-01T00:00:00Z'),
      leave('old', '2026-03-01', '2025-06-01T00:00:00Z'),
      leave('new', '2026-03-01', '2026-02-01T00:00:00Z'),
      leave('a', '2026-03-01', '2026-01-01T00:00:00Z'),
    ].sort(compareLeavesForList);
    expect(list.map((l) => l.id)).toEqual(['new', 'a', 'b', 'old']);
  });

  it('compares ids binary, like MongoDB (uppercase before lowercase)', () => {
    const list = [
      leave('a', '2026-03-01', '2026-01-01T00:00:00Z'),
      leave('B', '2026-03-01', '2026-01-01T00:00:00Z'),
    ].sort(compareLeavesForList);
    expect(list.map((l) => l.id)).toEqual(['B', 'a']);
  });
});
