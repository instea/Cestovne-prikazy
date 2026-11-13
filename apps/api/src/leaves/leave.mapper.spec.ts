import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toLeaveDto } from './leave.mapper';

const leave = {
  _id: 'internal-object-id',
  __v: 0,
  id: '7a1c0c5e-9a51-4d3e-8f6b-1d2c3b4a5e6f',
  requesterId: 'g-1',
  approverId: null as string | null,
  startDate: '2026-11-09',
  endDate: '2026-11-13',
  isHalfDay: false,
  type: LeaveType.ANNUAL,
  state: LeaveState.PENDING,
  numDays: 5,
  createdAt: new Date('2026-11-04T09:12:00Z'),
  updatedAt: new Date('2026-11-04T09:12:00Z'),
};

const jana = {
  _id: 'u-object-id',
  id: 'g-1',
  email: 'jana@instea.co',
  firstName: 'Jana',
  surname: 'Nová',
  active: true,
  anonymizedAt: null,
};
const boss = { ...jana, id: 'g-2', firstName: 'Boss', surname: 'Man' };
const users = new Map([
  [jana.id, jana],
  [boss.id, boss],
]);

describe('toLeaveDto', () => {
  it('maps the spec example and hides _id, __v and user ids', () => {
    const dto = toLeaveDto(leave, users);
    expect(dto).toEqual({
      id: leave.id,
      requester: {
        id: 'g-1',
        firstName: 'Jana',
        surname: 'Nová',
        active: true,
        anonymized: false,
      },
      approver: null,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      isHalfDay: false,
      type: 'ANNUAL',
      state: 'PENDING',
      numDays: 5,
      createdAt: '2026-11-04T09:12:00.000Z',
      updatedAt: '2026-11-04T09:12:00.000Z',
    });
    for (const key of ['_id', '__v', 'requesterId', 'approverId'])
      expect(dto).not.toHaveProperty(key);
    expect(dto.requester).not.toHaveProperty('email');
  });

  it('resolves the approver', () => {
    const dto = toLeaveDto({ ...leave, approverId: 'g-2' }, users);
    expect(dto.approver).toMatchObject({ id: 'g-2', firstName: 'Boss' });
  });

  it('gives a Deleted placeholder for a missing user and logs a warning', () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const dto = toLeaveDto(
      { ...leave, requesterId: 'gone', approverId: 'gone-too' },
      users,
    );
    expect(dto.requester).toEqual({
      id: 'gone',
      firstName: 'Deleted',
      surname: 'gone',
      active: false,
      anonymized: false,
    });
    expect(dto.approver).toMatchObject({ id: 'gone-too', surname: 'gone-too' });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      `Leave ${leave.id} references missing user gone`,
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
