import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, it } from 'vitest';
import {
  leaveCreatedDetails,
  leaveDecisionDetails,
  leaveDeletedDetails,
  leaveSnapshot,
  userAnonymizedDetails,
  userChangeDrafts,
  userDeactivatedDetails,
  userRegisteredDetails,
} from './audit-details';

const leave = {
  id: 'l1',
  requesterId: 'u1',
  approverId: null,
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  isHalfDay: false,
  type: LeaveType.ANNUAL,
  state: LeaveState.PENDING,
  numDays: 3,
};

describe('leaveSnapshot', () => {
  it('keeps exactly the snapshot keys in order and drops the rest', () => {
    const doc = {
      ...leave,
      _id: 'x',
      __v: 0,
      createdAt: new Date(),
      requester: { firstName: 'Jana' },
    };
    const snap = leaveSnapshot(doc);
    expect(Object.keys(snap)).toEqual([
      'id',
      'requesterId',
      'approverId',
      'startDate',
      'endDate',
      'isHalfDay',
      'type',
      'state',
      'numDays',
    ]);
    expect(snap).toEqual(leave);
  });

  it('wraps created / deleted snapshots', () => {
    expect(leaveCreatedDetails(leave)).toEqual({ after: leave });
    expect(leaveDeletedDetails(leave)).toEqual({ before: leave });
  });
});

describe('leaveDecisionDetails', () => {
  it('has previousState, newState, previousApproverId', () => {
    expect(
      leaveDecisionDetails(
        { state: LeaveState.PENDING, approverId: null },
        LeaveState.APPROVED,
      ),
    ).toEqual({
      previousState: 'PENDING',
      newState: 'APPROVED',
      previousApproverId: null,
    });
  });

  it('is written for a same-state decision too', () => {
    expect(
      leaveDecisionDetails(
        { state: LeaveState.APPROVED, approverId: 'a1' },
        LeaveState.APPROVED,
      ),
    ).toEqual({
      previousState: 'APPROVED',
      newState: 'APPROVED',
      previousApproverId: 'a1',
    });
  });
});

describe('userChangeDrafts', () => {
  const before = { firstName: 'Jana', surname: 'Nová', isAdmin: false };

  it('no change → no entry', () => {
    expect(userChangeDrafts(before, { ...before })).toEqual([]);
    expect(userChangeDrafts(before, {})).toEqual([]);
  });

  it('surname only → one USER_UPDATED with changed fields only', () => {
    expect(userChangeDrafts(before, { ...before, surname: 'Stará' })).toEqual([
      {
        action: 'USER_UPDATED',
        details: { before: { surname: 'Nová' }, after: { surname: 'Stará' } },
      },
    ]);
  });

  it('isAdmin only → one USER_ROLE_CHANGED', () => {
    expect(userChangeDrafts(before, { isAdmin: true })).toEqual([
      {
        action: 'USER_ROLE_CHANGED',
        details: { before: { isAdmin: false }, after: { isAdmin: true } },
      },
    ]);
  });

  it('name and role → USER_UPDATED then USER_ROLE_CHANGED', () => {
    const drafts = userChangeDrafts(before, {
      firstName: 'Janka',
      surname: 'Nová',
      isAdmin: true,
    });
    expect(drafts.map((d) => d.action)).toEqual([
      'USER_UPDATED',
      'USER_ROLE_CHANGED',
    ]);
    expect(drafts[0]!.details).toEqual({
      before: { firstName: 'Jana' },
      after: { firstName: 'Janka' },
    });
  });
});

describe('user details', () => {
  it('USER_REGISTERED has the new user fields, no ids', () => {
    expect(
      userRegisteredDetails({
        email: 'jana@instea.co',
        firstName: 'Jana',
        surname: 'Nová',
        isAdmin: false,
        active: true,
      }),
    ).toEqual({
      after: {
        email: 'jana@instea.co',
        firstName: 'Jana',
        surname: 'Nová',
        isAdmin: false,
        active: true,
      },
    });
  });

  it('USER_DEACTIVATED dates as ISO UTC strings', () => {
    expect(
      userDeactivatedDetails(
        { active: true, deactivatedAt: null },
        {
          active: false,
          deactivatedAt: new Date('2026-11-04T09:15:02.123Z'),
        },
      ),
    ).toEqual({
      before: { active: true, deactivatedAt: null },
      after: { active: false, deactivatedAt: '2026-11-04T09:15:02.123Z' },
    });
  });

  it('USER_ANONYMIZED has the four state keys', () => {
    const at = new Date('2026-11-04T10:00:00.000Z');
    expect(
      userAnonymizedDetails(
        {
          active: true,
          isAdmin: true,
          deactivatedAt: null,
          anonymizedAt: null,
        },
        { active: false, isAdmin: false, deactivatedAt: at, anonymizedAt: at },
      ),
    ).toEqual({
      before: {
        active: true,
        isAdmin: true,
        deactivatedAt: null,
        anonymizedAt: null,
      },
      after: {
        active: false,
        isAdmin: false,
        deactivatedAt: '2026-11-04T10:00:00.000Z',
        anonymizedAt: '2026-11-04T10:00:00.000Z',
      },
    });
  });
});
