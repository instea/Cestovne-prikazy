import type { LeaveDto, UserRefDto } from '@leaves/shared/dto';
import { missingUserRef } from '@leaves/shared/users';
import { Logger } from '@nestjs/common';
import type { Model } from 'mongoose';
import { toUserRefDto } from '../users/user.mapper';
import type { User } from '../users/user.schema';
import type { Leave } from './leave.schema';

/** Fields read from a Leave document or lean object; `_id` / `__v` never leave. */
export type LeaveLike = Pick<
  Leave,
  | 'id'
  | 'requesterId'
  | 'approverId'
  | 'startDate'
  | 'endDate'
  | 'isHalfDay'
  | 'type'
  | 'state'
  | 'numDays'
  | 'createdAt'
  | 'updatedAt'
>;

/** User fields needed for a `UserRefDto`. */
export type UserRefSource = Pick<
  User,
  'id' | 'firstName' | 'surname' | 'active' | 'anonymizedAt'
>;

const logger = new Logger('LeaveMapper');

/**
 * Leave → `LeaveDto`. `usersById` should hold the requester and approver.
 * A null `approverId` gives `approver: null`. An id with no user document
 * (should not happen after MIG-01) logs a warning and gives the placeholder
 * `{ id, firstName: 'Deleted', surname: id, active: false, anonymized: false }`
 * (LST-01), so the id is kept for the `Deleted <id>` display.
 */
export function toLeaveDto(
  l: LeaveLike,
  usersById: ReadonlyMap<string, UserRefSource>,
): LeaveDto {
  const ref = (id: string | null): UserRefDto | null => {
    if (id == null) return null;
    const u = usersById.get(id);
    if (u) return toUserRefDto(u);
    logger.warn(`Leave ${l.id} references missing user ${id}`);
    // The web renders it as `Deleted <id>` (shared `formatUserRef`).
    return missingUserRef(id);
  };
  return {
    id: l.id,
    requester: ref(l.requesterId),
    approver: ref(l.approverId),
    startDate: l.startDate,
    endDate: l.endDate,
    isHalfDay: l.isHalfDay,
    type: l.type,
    state: l.state,
    numDays: l.numDays,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

/** Maps leaves to DTOs, loading all referenced users with one query. */
export async function loadLeaveDtos(
  leaves: readonly LeaveLike[],
  users: Model<User>,
): Promise<LeaveDto[]> {
  if (leaves.length === 0) return [];
  const ids = new Set<string>();
  for (const l of leaves) {
    ids.add(l.requesterId);
    if (l.approverId != null) ids.add(l.approverId);
  }
  const found = await users
    .find({ id: { $in: [...ids] } })
    .select({ id: 1, firstName: 1, surname: 1, active: 1, anonymizedAt: 1 })
    .lean<UserRefSource[]>();
  const byId = new Map(found.map((u) => [u.id, u]));
  return leaves.map((l) => toLeaveDto(l, byId));
}
