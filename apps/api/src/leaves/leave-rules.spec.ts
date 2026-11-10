import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, it } from 'vitest';
import { leaveDecisionDetails } from '../audit/audit-details';
import type { LeaveLike } from './leave.mapper';
import { applyDecision, mayDeleteLeave } from './leaves.service';

const leave = (overrides: Partial<LeaveLike> = {}): LeaveLike => ({
  id: 'L1',
  requesterId: 'u-a',
  approverId: null,
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  isHalfDay: false,
  type: LeaveType.ANNUAL,
  state: LeaveState.PENDING,
  numDays: 3,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  ...overrides,
});

describe('mayDeleteLeave (LV-03)', () => {
  it.each([
    [{ id: 'u-a', isAdmin: false }, true],
    [{ id: 'u-b', isAdmin: false }, false],
    [{ id: 'u-admin', isAdmin: true }, true],
    [{ id: 'u-a', isAdmin: true }, true],
  ])('%o → %s', (caller, allowed) => {
    expect(mayDeleteLeave(caller, leave())).toBe(allowed);
  });

  it('does not depend on the state', () => {
    for (const state of Object.values(LeaveState)) {
      expect(
        mayDeleteLeave({ id: 'u-a', isAdmin: false }, leave({ state })),
      ).toBe(true);
      expect(
        mayDeleteLeave({ id: 'u-b', isAdmin: false }, leave({ state })),
      ).toBe(false);
    }
  });
});

describe('applyDecision (APR-01 transition table)', () => {
  const now = new Date('2026-11-10T08:00:00.000Z');

  it.each([
    [LeaveState.PENDING, LeaveState.APPROVED],
    [LeaveState.PENDING, LeaveState.REJECTED],
    [LeaveState.APPROVED, LeaveState.APPROVED],
    [LeaveState.APPROVED, LeaveState.REJECTED],
    [LeaveState.REJECTED, LeaveState.APPROVED],
    [LeaveState.REJECTED, LeaveState.REJECTED],
  ] as const)('%s + %s', (previous, decision) => {
    const before = leave({
      state: previous,
      approverId: previous === LeaveState.PENDING ? null : 'u-old-admin',
    });
    const after = applyDecision(before, decision, 'u-admin', now);
    expect(after).toEqual({
      ...before,
      state: decision,
      approverId: 'u-admin',
      updatedAt: now,
    });
    // The previous document is kept for the audit entry and NOT-03.
    expect(before.state).toBe(previous);
    expect(leaveDecisionDetails(before, decision)).toEqual({
      previousState: previous,
      newState: decision,
      previousApproverId: before.approverId,
    });
  });

  it('overwrites the approver also on a same-state call', () => {
    const before = leave({
      state: LeaveState.APPROVED,
      approverId: 'u-admin-a',
    });
    expect(
      applyDecision(before, LeaveState.APPROVED, 'u-admin-b', now).approverId,
    ).toBe('u-admin-b');
  });

  it('never changes numDays, dates, type or requester', () => {
    const before = leave({
      isHalfDay: true,
      endDate: '2026-12-21',
      numDays: 0.5,
    });
    const after = applyDecision(before, LeaveState.REJECTED, 'u-admin', now);
    for (const key of [
      'id',
      'requesterId',
      'startDate',
      'endDate',
      'isHalfDay',
      'type',
      'numDays',
      'createdAt',
    ] as const) {
      expect(after[key]).toEqual(before[key]);
    }
  });
});
