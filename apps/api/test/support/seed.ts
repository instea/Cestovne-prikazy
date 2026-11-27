import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type IsoDate, LeaveState, LeaveType } from '@leaves/shared/leaves';
import { leaveWorkDays } from '@leaves/shared/workdays';
import type { Model } from 'mongoose';
import { CLOCK, type Clock } from '../../src/common/clock';
import { Leave } from '../../src/leaves/leave.schema';
import { User } from '../../src/users/user.schema';

/**
 * TST-02 seed helpers. They write through the app's own Mongoose models, so
 * schema defaults and validation (DATA-01 / DATA-02) apply.
 */

export interface SeedUserOptions {
  isAdmin?: boolean;
  /** `false` → deactivated at the app clock's `now()`. */
  active?: boolean;
  id?: string;
  email?: string;
  firstName?: string;
  surname?: string;
}

export async function seedUser(
  app: INestApplication,
  options: SeedUserOptions = {},
): Promise<User> {
  const Users = app.get<Model<User>>(getModelToken(User.name));
  const clock = app.get<Clock>(CLOCK);
  const n = randomBytes(6).toString('hex');
  const active = options.active ?? true;
  const doc = await Users.create({
    id: options.id ?? `google-${n}`,
    email: options.email ?? `user.${n}@instea.co`,
    firstName: options.firstName ?? 'Jana',
    surname: options.surname ?? 'Nová',
    isAdmin: options.isAdmin ?? false,
    active,
    deactivatedAt: active ? null : clock.now(),
  });
  return doc.toObject();
}

export interface SeedLeaveOptions {
  requester: Pick<User, 'id'>;
  approver?: Pick<User, 'id'> | null;
  startDate?: IsoDate;
  endDate?: IsoDate;
  isHalfDay?: boolean;
  type?: LeaveType;
  state?: LeaveState;
  /** Default: `leaveWorkDays()` (WD-01), as LV-01 computes it. */
  numDays?: number;
}

export async function seedLeave(
  app: INestApplication,
  options: SeedLeaveOptions,
): Promise<Leave> {
  const Leaves = app.get<Model<Leave>>(getModelToken(Leave.name));
  const startDate = options.startDate ?? '2026-12-21';
  const endDate = options.endDate ?? startDate;
  const isHalfDay = options.isHalfDay ?? false;
  const doc = await Leaves.create({
    requesterId: options.requester.id,
    approverId: options.approver?.id ?? null,
    startDate,
    endDate,
    isHalfDay,
    type: options.type ?? LeaveType.ANNUAL,
    state: options.state ?? LeaveState.PENDING,
    numDays:
      options.numDays ?? leaveWorkDays({ startDate, endDate, isHalfDay }),
  });
  return doc.toObject();
}
