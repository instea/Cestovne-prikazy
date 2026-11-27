import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, it } from 'vitest';
import {
  type AuditSource,
  compareExportLeaves,
  exportFileName,
  isExportedEntry,
  selectExportEntries,
  toExportEntry,
  toExportLeave,
} from './user-export';

const U = 'u-1';
const OTHER = 'u-2';

let seq = 0;
function entry(overrides: Partial<AuditSource> = {}): AuditSource {
  seq++;
  return {
    id: `e-${String(seq).padStart(3, '0')}`,
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
    actorType: 'user',
    actorId: 'admin',
    action: 'USER_UPDATED',
    targetType: 'USER',
    targetId: 'nobody',
    details: null,
    ...overrides,
  };
}

const snapshot = (requesterId: string) => ({
  id: 'l-x',
  requesterId,
  approverId: null,
  startDate: '2026-07-01',
  endDate: '2026-07-01',
  isHalfDay: false,
  type: 'ANNUAL',
  state: 'PENDING',
  numDays: 1,
});

describe('isExportedEntry (NFR-07 selection predicate)', () => {
  const own = new Set(['l-own']);

  it('the user is the actor (any target)', () => {
    expect(isExportedEntry(entry({ actorId: U }), U, own)).toBe(true);
    expect(
      isExportedEntry(
        entry({ actorId: U, targetType: 'LEAVE', targetId: 'l-other' }),
        U,
        own,
      ),
    ).toBe(true);
  });

  it('the user is the USER target', () => {
    expect(isExportedEntry(entry({ targetId: U }), U, own)).toBe(true);
    expect(isExportedEntry(entry({ targetId: OTHER }), U, own)).toBe(false);
  });

  it('a USER entry is not matched through a leave id', () => {
    expect(isExportedEntry(entry({ targetId: 'l-own' }), U, own)).toBe(false);
  });

  it('a LEAVE entry whose snapshot has the user as requester (created / deleted leaves)', () => {
    expect(
      isExportedEntry(
        entry({
          action: 'LEAVE_DELETED',
          targetType: 'LEAVE',
          targetId: 'l-gone',
          details: { before: snapshot(U) },
        }),
        U,
        own,
      ),
    ).toBe(true);
    expect(
      isExportedEntry(
        entry({
          action: 'LEAVE_CREATED',
          targetType: 'LEAVE',
          targetId: 'l-new',
          details: { after: snapshot(U) },
        }),
        U,
        own,
      ),
    ).toBe(true);
    expect(
      isExportedEntry(
        entry({
          action: 'LEAVE_CREATED',
          targetType: 'LEAVE',
          targetId: 'l-new',
          details: { after: snapshot(OTHER) },
        }),
        U,
        own,
      ),
    ).toBe(false);
  });

  it('an approve / reject entry (no snapshot) of one of the user’s current leaves', () => {
    const decision = (targetId: string) =>
      entry({
        action: 'LEAVE_APPROVED',
        targetType: 'LEAVE',
        targetId,
        details: {
          previousState: 'PENDING',
          newState: 'APPROVED',
          previousApproverId: null,
        },
      });
    expect(isExportedEntry(decision('l-own'), U, own)).toBe(true);
    expect(isExportedEntry(decision('l-other'), U, own)).toBe(false);
  });

  it('tolerates null / non-object details', () => {
    expect(
      isExportedEntry(
        entry({ targetType: 'LEAVE', targetId: 'l-z', details: null }),
        U,
        own,
      ),
    ).toBe(false);
    expect(
      isExportedEntry(
        entry({
          targetType: 'LEAVE',
          targetId: 'l-z',
          details: { before: 'x', after: null },
        }),
        U,
        own,
      ),
    ).toBe(false);
  });
});

describe('toExportEntry (redaction rule)', () => {
  it('the user only acted on another USER → details null, redacted', () => {
    const e = entry({
      actorId: U,
      targetId: OTHER,
      details: { before: { surname: 'Old' }, after: { surname: 'New' } },
    });
    expect(toExportEntry(e, U)).toEqual({
      id: e.id,
      at: e.at.toISOString(),
      actorType: 'user',
      actorId: U,
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: OTHER,
      details: null,
      redacted: true,
    });
  });

  it('entries about the user keep their details (also by another actor)', () => {
    const details = { before: { surname: 'Old' }, after: { surname: 'New' } };
    expect(toExportEntry(entry({ targetId: U, details }), U)).toMatchObject({
      details,
      redacted: false,
    });
    expect(
      toExportEntry(entry({ actorId: U, targetId: U, details }), U),
    ).toMatchObject({ details, redacted: false });
  });

  it('LEAVE entries are never redacted (ids only)', () => {
    const details = { before: snapshot(OTHER) };
    expect(
      toExportEntry(
        entry({ actorId: U, targetType: 'LEAVE', targetId: 'l-x', details }),
        U,
      ),
    ).toMatchObject({ details, redacted: false });
  });
});

describe('selectExportEntries', () => {
  it('filters, deduplicates by id and sorts by at, then id', () => {
    const late = entry({ targetId: U, at: new Date('2026-05-01T00:00:00Z') });
    const early = entry({ actorId: U, at: new Date('2026-01-01T00:00:00Z') });
    const sameAtB = entry({
      id: 'b',
      targetId: U,
      at: new Date('2026-03-01T00:00:00Z'),
    });
    const sameAtA = entry({
      id: 'a',
      targetId: U,
      at: new Date('2026-03-01T00:00:00Z'),
    });
    const unrelated = entry({ targetId: OTHER });
    const result = selectExportEntries(
      [late, early, sameAtB, unrelated, late, sameAtA, early],
      U,
      new Set(),
    );
    expect(result.map((e) => e.id)).toEqual([early.id, 'a', 'b', late.id]);
  });
});

describe('toExportLeave / compareExportLeaves', () => {
  const leave = {
    _id: 'internal',
    __v: 0,
    id: 'l-1',
    requesterId: U,
    approverId: null,
    startDate: '2026-07-01' as const,
    endDate: '2026-07-03' as const,
    isHalfDay: false,
    type: LeaveType.ANNUAL,
    state: LeaveState.APPROVED,
    numDays: 3,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    updatedAt: new Date('2026-06-02T08:00:00Z'),
  };

  it('raw entity fields only, ISO timestamps, no _id / __v / names', () => {
    expect(toExportLeave(leave)).toEqual({
      id: 'l-1',
      requesterId: U,
      approverId: null,
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      isHalfDay: false,
      type: 'ANNUAL',
      state: 'APPROVED',
      numDays: 3,
      createdAt: '2026-06-01T08:00:00.000Z',
      updatedAt: '2026-06-02T08:00:00.000Z',
    });
  });

  it('sorts by startDate, then id', () => {
    const a = toExportLeave({ ...leave, id: 'b', startDate: '2026-01-05' });
    const b = toExportLeave({ ...leave, id: 'a', startDate: '2026-01-05' });
    const c = toExportLeave({ ...leave, id: 'z', startDate: '2025-12-31' });
    expect([a, b, c].sort(compareExportLeaves).map((l) => l.id)).toEqual([
      'z',
      'a',
      'b',
    ]);
  });
});

describe('exportFileName', () => {
  const tz = 'Europe/Bratislava';

  it('uses the date in DEFAULT_TIMEZONE', () => {
    expect(
      exportFileName('1122334455', new Date('2026-11-04T22:30:00Z'), tz),
    ).toBe('user-export-1122334455-2026-11-04.json');
    expect(
      exportFileName('1122334455', new Date('2026-11-04T23:30:00Z'), tz),
    ).toBe('user-export-1122334455-2026-11-05.json');
  });

  it('keeps the header value safe for unusual ids', () => {
    expect(
      exportFileName('a"b\r\n/ c', new Date('2026-11-04T10:00:00Z'), tz),
    ).toBe('user-export-a_b____c-2026-11-04.json');
  });
});
