import { TZDate } from '@date-fns/tz';
import type {
  AuditAction,
  AuditActorType,
  AuditTargetType,
} from '@leaves/shared/audit';
import type { UserDto } from '@leaves/shared/dto';
import type { IsoDate, LeaveState, LeaveType } from '@leaves/shared/leaves';
import { format } from 'date-fns';
import type { FilterQuery } from 'mongoose';
import type { AuditLog } from '../audit/audit-log.schema';
import type { Leave } from '../leaves/leave.schema';

/**
 * NFR-07 GDPR export of one user's data: pure parts (entry selection,
 * redaction, leave shape, file name). The service loads the data and writes
 * the `USER_DATA_EXPORTED` audit entry.
 */

export const EXPORT_FORMAT_VERSION = 1;

/** A leave in the export: raw entity fields, ids only (no `UserRefDto`). */
export interface ExportLeave {
  id: string;
  requesterId: string;
  approverId: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
  type: LeaveType;
  state: LeaveState;
  numDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportAuditEntry {
  id: string;
  at: string;
  actorType: AuditActorType;
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: Record<string, unknown> | null;
  /** `true`: `details` held another user's data and was removed. */
  redacted: boolean;
}

export interface UserExportFile {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  exportedBy: string;
  /** All User fields (DATA-01); no refresh-token data. */
  user: UserDto;
  leavesAsRequester: ExportLeave[];
  leavesAsApprover: ExportLeave[];
  auditEntries: ExportAuditEntry[];
}

export type LeaveSource = Pick<
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

export type AuditSource = Pick<
  AuditLog,
  | 'id'
  | 'at'
  | 'actorType'
  | 'actorId'
  | 'action'
  | 'targetType'
  | 'targetId'
  | 'details'
>;

/** Leave → export shape: exactly these keys, nothing from `_id` / `__v`. */
export function toExportLeave(leave: LeaveSource): ExportLeave {
  return {
    id: leave.id,
    requesterId: leave.requesterId,
    approverId: leave.approverId ?? null,
    startDate: leave.startDate,
    endDate: leave.endDate,
    isHalfDay: leave.isHalfDay,
    type: leave.type,
    state: leave.state,
    numDays: leave.numDays,
    createdAt: leave.createdAt.toISOString(),
    updatedAt: leave.updatedAt.toISOString(),
  };
}

/** Leave sort of both leave lists: `startDate` asc, then `id`. */
export function compareExportLeaves(a: ExportLeave, b: ExportLeave): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** `details.<side>.requesterId` of a leave snapshot entry, if any. */
function snapshotRequesterId(
  details: Record<string, unknown> | null,
  side: 'before' | 'after',
): unknown {
  const snapshot = details?.[side];
  return typeof snapshot === 'object' && snapshot !== null
    ? (snapshot as Record<string, unknown>).requesterId
    : undefined;
}

/**
 * Does the entry belong to the export of `userId`? It does when the user is
 * the actor, the USER target, or the requester of the LEAVE target: by the
 * leave snapshot (`LEAVE_CREATED` / `LEAVE_DELETED`, also for deleted
 * leaves) or, for entries without one (approve / reject), by the leave id
 * among the user's current leaves (`ownLeaveIds`).
 */
export function isExportedEntry(
  entry: Pick<AuditSource, 'actorId' | 'targetType' | 'targetId' | 'details'>,
  userId: string,
  ownLeaveIds: ReadonlySet<string>,
): boolean {
  if (entry.actorId === userId) return true;
  if (entry.targetType === 'USER') return entry.targetId === userId;
  return (
    snapshotRequesterId(entry.details, 'before') === userId ||
    snapshotRequesterId(entry.details, 'after') === userId ||
    ownLeaveIds.has(entry.targetId)
  );
}

/**
 * MongoDB filter for the same entries as `isExportedEntry` (the database
 * pre-selects, the predicate decides).
 */
export function exportedEntriesFilter(
  userId: string,
  ownLeaveIds: ReadonlySet<string>,
): FilterQuery<AuditLog> {
  return {
    $or: [
      { actorId: userId },
      { targetType: 'USER', targetId: userId },
      {
        targetType: 'LEAVE',
        $or: [
          { 'details.before.requesterId': userId },
          { 'details.after.requesterId': userId },
          { targetId: { $in: [...ownLeaveIds] } },
        ],
      },
    ],
  };
}

/**
 * Redaction rule: when the user is only the actor and the target is another
 * USER (e.g. the exported admin renamed someone), that user's data in
 * `details` is dropped. Every other entry is kept as stored.
 */
export function toExportEntry(
  entry: AuditSource,
  userId: string,
): ExportAuditEntry {
  const redacted = entry.targetType === 'USER' && entry.targetId !== userId;
  return {
    id: entry.id,
    at: entry.at.toISOString(),
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: redacted ? null : (entry.details ?? null),
    redacted,
  };
}

/**
 * `auditEntries` of the file: the matching entries, deduplicated by `id`,
 * sorted by `at` asc (then `id`), redacted.
 */
export function selectExportEntries(
  entries: readonly AuditSource[],
  userId: string,
  ownLeaveIds: ReadonlySet<string>,
): ExportAuditEntry[] {
  const byId = new Map<string, AuditSource>();
  for (const entry of entries) {
    if (isExportedEntry(entry, userId, ownLeaveIds) && !byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        a.at.getTime() - b.at.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((entry) => toExportEntry(entry, userId));
}

/**
 * `user-export-<id>-<yyyy-MM-dd>.json`, the date of `now` in `timeZone`
 * (`DEFAULT_TIMEZONE`). Characters outside `[A-Za-z0-9._-]` in the id
 * (none in a Google `sub`) become `_`, so the header value stays valid.
 */
export function exportFileName(
  userId: string,
  now: Date,
  timeZone: string,
): string {
  const day = format(new TZDate(now.getTime(), timeZone), 'yyyy-MM-dd');
  const safeId = userId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `user-export-${safeId}-${day}.json`;
}
