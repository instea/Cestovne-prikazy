import type { AuditAction } from '@leaves/shared/audit';
import type { IsoDate, LeaveState, LeaveType } from '@leaves/shared/leaves';

/**
 * NFR-06 `details` builders. Pure functions used by the writing tasks
 * (LV-01, LV-03, APR-01, AUTH-01, AUTH-04, USR-02/03/04, NFR-07/08).
 * Leave dates stay `YYYY-MM-DD`; Date fields become ISO 8601 UTC strings.
 */

export interface LeaveSnapshot {
  id: string;
  requesterId: string;
  approverId: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
  type: LeaveType;
  state: LeaveState;
  numDays: number;
}

/** Leave snapshot: exactly these keys, in this order; ids only, no names. */
export function leaveSnapshot(leave: LeaveSnapshot): LeaveSnapshot {
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
  };
}

/** `LEAVE_CREATED`. */
export const leaveCreatedDetails = (leave: LeaveSnapshot) => ({
  after: leaveSnapshot(leave),
});

/** `LEAVE_DELETED`. */
export const leaveDeletedDetails = (leave: LeaveSnapshot) => ({
  before: leaveSnapshot(leave),
});

/**
 * `LEAVE_APPROVED` / `LEAVE_REJECTED`: written on every accepted call, also
 * when the state does not change (interview: Transitions).
 */
export function leaveDecisionDetails(
  previous: { state: LeaveState; approverId: string | null },
  newState: LeaveState,
) {
  return {
    previousState: previous.state,
    newState,
    previousApproverId: previous.approverId ?? null,
  };
}

/** `USER_REGISTERED`. */
export function userRegisteredDetails(user: {
  email: string;
  firstName: string;
  surname: string;
  isAdmin: boolean;
  active: boolean;
}) {
  return {
    after: {
      email: user.email,
      firstName: user.firstName,
      surname: user.surname,
      isAdmin: user.isAdmin,
      active: user.active,
    },
  };
}

export interface EditableUserFields {
  firstName: string;
  surname: string;
  isAdmin: boolean;
}

/** One entry to write; the target/actor are added by the caller. */
export interface AuditDraft {
  action: AuditAction;
  details: Record<string, unknown> | null;
}

/**
 * USR-02 / USR-03 / AUTH-04: `USER_UPDATED` only when `firstName` or
 * `surname` changes (changed fields only), `USER_ROLE_CHANGED` only when
 * `isAdmin` changes. No change → no entry. Fields absent from `after` are
 * unchanged.
 */
export function userChangeDrafts(
  before: EditableUserFields,
  after: Partial<EditableUserFields>,
): AuditDraft[] {
  const drafts: AuditDraft[] = [];
  const old: Record<string, string> = {};
  const next: Record<string, string> = {};
  for (const key of ['firstName', 'surname'] as const) {
    const value = after[key];
    if (value !== undefined && value !== before[key]) {
      old[key] = before[key];
      next[key] = value;
    }
  }
  if (Object.keys(next).length > 0) {
    drafts.push({
      action: 'USER_UPDATED',
      details: { before: old, after: next },
    });
  }
  if (after.isAdmin !== undefined && after.isAdmin !== before.isAdmin) {
    drafts.push({
      action: 'USER_ROLE_CHANGED',
      details: {
        before: { isAdmin: before.isAdmin },
        after: { isAdmin: after.isAdmin },
      },
    });
  }
  return drafts;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** `USER_DEACTIVATED`. */
export function userDeactivatedDetails(
  before: { active: boolean; deactivatedAt: Date | null },
  after: { active: boolean; deactivatedAt: Date | null },
) {
  return {
    before: { active: before.active, deactivatedAt: iso(before.deactivatedAt) },
    after: { active: after.active, deactivatedAt: iso(after.deactivatedAt) },
  };
}

interface AnonymizationState {
  active: boolean;
  isAdmin: boolean;
  deactivatedAt: Date | null;
  anonymizedAt: Date | null;
}

/** `USER_ANONYMIZED` (NFR-08). */
export function userAnonymizedDetails(
  before: AnonymizationState,
  after: AnonymizationState,
) {
  const shape = (s: AnonymizationState) => ({
    active: s.active,
    isAdmin: s.isAdmin,
    deactivatedAt: iso(s.deactivatedAt),
    anonymizedAt: iso(s.anonymizedAt),
  });
  return { before: shape(before), after: shape(after) };
}

/** Value that replaces scrubbed personal data in audit `details` (NFR-08). */
export const ANONYMIZED_VALUE = '[anonymized]';

/** The personal-data keys NFR-08 scrubs (in `details.before` / `details.after`). */
export const PERSONAL_DATA_KEYS = ['email', 'firstName', 'surname'] as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * NFR-08 scrub of one entry's `details`: in `details.before` and
 * `details.after` only, every present, non-null `email` / `firstName` /
 * `surname` becomes `"[anonymized]"`. Everything else (other keys, other
 * levels, `null` values, `details: null`) is untouched. Returns the same
 * reference when nothing changes, else a new object (the input is not
 * mutated).
 */
export function scrubPersonalDetails<T extends Record<string, unknown> | null>(
  details: T,
): T {
  if (!isPlainObject(details)) return details;
  let result: Record<string, unknown> | null = null;
  for (const side of ['before', 'after'] as const) {
    const part = details[side];
    if (!isPlainObject(part)) continue;
    let scrubbed: Record<string, unknown> | null = null;
    for (const key of PERSONAL_DATA_KEYS) {
      if (!(key in part) || part[key] === null) continue;
      if (part[key] === ANONYMIZED_VALUE) continue;
      scrubbed ??= { ...part };
      scrubbed[key] = ANONYMIZED_VALUE;
    }
    if (scrubbed) {
      result ??= { ...details };
      result[side] = scrubbed;
    }
  }
  return (result ?? details) as T;
}
