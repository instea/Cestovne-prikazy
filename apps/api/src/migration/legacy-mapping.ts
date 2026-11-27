import { TZDate } from '@date-fns/tz';
import { ErrorCode } from '@leaves/shared/enums';
import {
  leaveDateRuleError,
  LeaveState,
  LeaveType,
} from '@leaves/shared/leaves';
import { type IsoDate, leaveWorkDays } from '@leaves/shared/workdays';
import { format } from 'date-fns';
import { Mongoose, Types } from 'mongoose';
import { Leave, LeaveSchema } from '../leaves/leave.schema';
import { User, UserSchema } from '../users/user.schema';

/**
 * MIG-01 core: pure mapping of the legacy `users` / `leaves` documents to
 * the new DATA-01 / DATA-02 shapes, with findings for the validation report.
 * No I/O here; `runner.ts` reads and writes the databases.
 */

/** A raw document of the legacy collections (any shape). */
export type LegacyDoc = Record<string, unknown> & { _id?: unknown };

export type Severity = 'error' | 'warning' | 'info';
export type FindingAction =
  'skipped' | 'migrated' | 'migrated-with-default' | 'placeholder-created';

export interface Finding {
  severity: Severity;
  code: string;
  collection: 'users' | 'leaves';
  sourceObjectId: string | null;
  recordId: string | null;
  message: string;
  details: Record<string, unknown> | null;
  action: FindingAction;
}

/** Target User document (DATA-01) as inserted. */
export interface TargetUser {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  isAdmin: boolean;
  active: boolean;
  deactivatedAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Target Leave document (DATA-02) as inserted. */
export interface TargetLeave {
  id: string;
  requesterId: string;
  approverId: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
  type: LeaveType;
  state: LeaveState;
  numDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationResult {
  /** Real users first (source order), then placeholders (first reference order). */
  users: TargetUser[];
  placeholderUserIds: string[];
  /** Source natural order, so new `_id` order matches (ATT-04). */
  leaves: TargetLeave[];
  findings: Finding[];
  source: { users: number; leaves: number };
  skipped: { users: number; leaves: number };
  droppedFields: { degreesNonEmpty: number; addressNonEmpty: number };
}

export interface MigrationOptions {
  timezone: string;
  /** Migration run start: placeholder timestamps and fallback timestamps. */
  runStartedAt: Date;
}

/** Findings whose record is written with a default value. */
const DEFAULTING_CODES = new Set([
  'USER_EMPTY_NAME',
  'USER_ISADMIN_DEFAULTED',
  'LEAVE_TYPE_DEFAULTED',
  'LEAVE_STATE_DEFAULTED',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Private Mongoose instance: the app's schemas validate the mapped records
// (same validators as the API) without any connection.
const validationMongoose = new Mongoose();
const UserValidator = validationMongoose.model(User.name, UserSchema);
const LeaveValidator = validationMongoose.model(Leave.name, LeaveSchema);

/** Result of converting a legacy leave instant to a calendar date. */
export interface ConvertedDate {
  date: IsoDate;
  /** The instant is exactly 00:00:00.000 local time in the timezone. */
  localMidnight: boolean;
}

/**
 * Legacy leave instant (browser-local midnight, stored as UTC `Date`) →
 * calendar date in `timezone`. `null` for a missing or invalid `Date`.
 */
export function toCalendarDate(
  value: unknown,
  timezone: string,
): ConvertedDate | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const local = new TZDate(value.getTime(), timezone);
  return {
    date: format(local, 'yyyy-MM-dd'),
    localMidnight:
      local.getHours() === 0 &&
      local.getMinutes() === 0 &&
      local.getSeconds() === 0 &&
      local.getMilliseconds() === 0,
  };
}

interface ObjectIdLike {
  toHexString(): string;
  getTimestamp(): Date;
}

/** Duck-typed: the driver's and Mongoose's bson copies may differ. */
function isObjectId(id: unknown): id is ObjectIdLike {
  return (
    id instanceof Types.ObjectId ||
    (typeof id === 'object' &&
      id !== null &&
      typeof (id as Partial<ObjectIdLike>).toHexString === 'function' &&
      typeof (id as Partial<ObjectIdLike>).getTimestamp === 'function')
  );
}

function objectIdHex(id: unknown): string | null {
  if (isObjectId(id)) return id.toHexString();
  if (id == null) return null;
  return typeof id === 'string' ? id : JSON.stringify(id);
}

/** `_id.getTimestamp()`; run start when `_id` is not an ObjectId. */
function objectIdTime(id: unknown, fallback: Date): Date {
  return isObjectId(id) ? id.getTimestamp() : fallback;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function isNonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

/** Severity → action of a finding on a record that is written. */
export function actionFor(
  severity: Severity,
  code: string,
  recordSkipped: boolean,
): FindingAction {
  if (recordSkipped || severity === 'error') return 'skipped';
  if (code === 'USER_PLACEHOLDER_CREATED') return 'placeholder-created';
  return DEFAULTING_CODES.has(code) ? 'migrated-with-default' : 'migrated';
}

type Draft = Omit<Finding, 'action' | 'collection' | 'sourceObjectId'>;

/** Per-record finding collector; actions are settled once the record is decided. */
class RecordFindings {
  readonly items: Draft[] = [];
  constructor(
    readonly collection: 'users' | 'leaves',
    readonly sourceObjectId: string | null,
    public recordId: string | null,
  ) {}

  add(
    severity: Severity,
    code: string,
    message: string,
    details: Record<string, unknown> | null = null,
  ): void {
    this.items.push({
      severity,
      code,
      recordId: this.recordId,
      message,
      details,
    });
  }

  get hasError(): boolean {
    return this.items.some((f) => f.severity === 'error');
  }

  settle(): Finding[] {
    const skipped = this.hasError;
    return this.items.map((f) => ({
      severity: f.severity,
      code: f.code,
      collection: this.collection,
      sourceObjectId: this.sourceObjectId,
      recordId: f.recordId,
      message: f.message,
      details: f.details,
      action: actionFor(f.severity, f.code, skipped),
    }));
  }
}

/** Mongoose validation errors of `doc` against the app schema, by path. */
function schemaErrors(
  validator: typeof UserValidator | typeof LeaveValidator,
  doc: object,
): Record<string, string> {
  const err = new validator(doc).validateSync();
  if (!err) return {};
  return Object.fromEntries(
    Object.entries(err.errors).map(([path, e]) => [path, e.message]),
  );
}

interface UserPass {
  users: TargetUser[];
  /** Ids of every source user (written or not). */
  sourceIds: Set<string>;
  /** Ids of source users not written because of an error. */
  skippedIds: Set<string>;
  findings: Finding[];
  skipped: number;
}

/** Map and validate all source users (rules: MIG-01 User table). */
export function mapUsers(
  source: LegacyDoc[],
  opts: MigrationOptions,
): UserPass {
  const records = source.map((doc) => {
    const id = nonEmptyString(doc.id) ? doc.id : null;
    const rec = new RecordFindings('users', objectIdHex(doc._id), id);
    const email =
      typeof doc.email === 'string' ? doc.email.trim().toLowerCase() : '';
    return { doc, id, email, rec };
  });

  const count = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const idCounts = count(records.flatMap((r) => (r.id ? [r.id] : [])));
  const emailCounts = count(records.flatMap((r) => (r.email ? [r.email] : [])));

  const users: TargetUser[] = [];
  const sourceIds = new Set<string>();
  const skippedIds = new Set<string>();
  const findings: Finding[] = [];
  let skipped = 0;

  for (const { doc, id, email, rec } of records) {
    if (id === null) {
      rec.add('error', 'USER_MISSING_ID', 'User has no id');
    } else {
      sourceIds.add(id);
      if ((idCounts.get(id) ?? 0) > 1)
        rec.add(
          'error',
          'USER_DUPLICATE_ID',
          'Several source users have this id; none is migrated',
          { count: idCounts.get(id) },
        );
    }

    const firstName =
      typeof doc.firstName === 'string' ? doc.firstName.trim() : '';
    const surname = typeof doc.surname === 'string' ? doc.surname.trim() : '';
    const isAdmin = doc.isAdmin === true;
    const at = objectIdTime(doc._id, opts.runStartedAt);
    const target: TargetUser = {
      id: id ?? '',
      email,
      firstName,
      surname,
      isAdmin,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
      createdAt: at,
      updatedAt: at,
    };

    const errors = schemaErrors(UserValidator, target);
    if (!email || errors.email) {
      rec.add(
        'error',
        'USER_INVALID_EMAIL',
        'User email is missing or invalid',
        {
          email: doc.email ?? null,
        },
      );
    } else if ((emailCounts.get(email) ?? 0) > 1) {
      rec.add(
        'error',
        'USER_DUPLICATE_EMAIL',
        'Several source users have this email (case-insensitive); none is migrated',
        { email },
      );
    }
    const otherErrors = Object.entries(errors).filter(
      ([p]) => p !== 'email' && p !== 'id',
    );
    if (otherErrors.length > 0) {
      rec.add('error', 'USER_SCHEMA_INVALID', 'User fails the User schema', {
        errors: Object.fromEntries(otherErrors),
      });
    }

    const emptyFields = [
      ...(firstName === '' ? ['firstName'] : []),
      ...(surname === '' ? ['surname'] : []),
    ];
    if (emptyFields.length > 0) {
      rec.add(
        'warning',
        'USER_EMPTY_NAME',
        'User name is empty; migrated as empty',
        {
          fields: emptyFields,
        },
      );
    }
    if (typeof doc.isAdmin !== 'boolean') {
      rec.add(
        'info',
        'USER_ISADMIN_DEFAULTED',
        'isAdmin missing; set to false',
        {
          source: doc.isAdmin ?? null,
        },
      );
    }
    if (doc.approved !== true) {
      rec.add(
        'info',
        'USER_APPROVED_FALSE_ACTIVATED',
        'User was not approved; migrated as active',
        { approved: doc.approved ?? null },
      );
    }

    if (rec.hasError) {
      skipped++;
      if (id !== null) skippedIds.add(id);
    } else {
      users.push(target);
    }
    findings.push(...rec.settle());
  }

  return { users, sourceIds, skippedIds, findings, skipped };
}

/** Placeholder for a removed user (old `server/service/userService.js:3-13`). */
export function placeholderUser(id: string, at: Date): TargetUser {
  return {
    id,
    email: `${id}@deleted.instea.co`.toLowerCase(),
    firstName: 'Deleted',
    surname: id,
    isAdmin: false,
    active: false,
    deactivatedAt: at,
    anonymizedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Placeholders that cannot be written: they fail the User schema (e.g. an id
 * that makes an invalid email) or their email collides with a migrated user
 * or another placeholder (`X` / `x` → same lowercased email). Checked over
 * every candidate id up front, so the dry run predicts the unique-index
 * outcome of the real run. Returns id → reason details.
 */
export function invalidPlaceholders(
  candidateIds: Iterable<string>,
  users: TargetUser[],
  at: Date,
): Map<string, Record<string, unknown>> {
  const invalid = new Map<string, Record<string, unknown>>();
  const userEmails = new Set(users.map((u) => u.email));
  const byEmail = new Map<string, string[]>();
  for (const id of candidateIds) {
    const p = placeholderUser(id, at);
    const errors = schemaErrors(UserValidator, p);
    if (Object.keys(errors).length > 0) {
      invalid.set(id, { email: p.email, errors });
      continue;
    }
    if (userEmails.has(p.email)) {
      invalid.set(id, { email: p.email, conflict: 'migrated-user' });
      continue;
    }
    byEmail.set(p.email, [...(byEmail.get(p.email) ?? []), id]);
  }
  for (const [email, ids] of byEmail) {
    if (ids.length < 2) continue;
    for (const id of ids)
      invalid.set(id, {
        email,
        conflict: 'placeholder',
        conflictingIds: ids.filter((other) => other !== id),
      });
  }
  return invalid;
}

/** Map users and leaves, create placeholders, validate (MIG-01 order). */
export function migrateLegacy(
  sourceUsers: LegacyDoc[],
  sourceLeaves: LegacyDoc[],
  opts: MigrationOptions,
): MigrationResult {
  const userPass = mapUsers(sourceUsers, opts);
  const findings = [...userPass.findings];

  const idCounts = new Map<string, number>();
  for (const doc of sourceLeaves) {
    if (nonEmptyString(doc.id))
      idCounts.set(doc.id, (idCounts.get(doc.id) ?? 0) + 1);
  }

  // Placeholder candidates: referenced ids with no source user.
  const candidates = new Set<string>();
  for (const doc of sourceLeaves) {
    for (const ref of [doc.requesterId, doc.approverId]) {
      if (
        nonEmptyString(ref) &&
        !userPass.sourceIds.has(ref) &&
        !userPass.skippedIds.has(ref)
      )
        candidates.add(ref);
    }
  }
  const badPlaceholders = invalidPlaceholders(
    candidates,
    userPass.users,
    opts.runStartedAt,
  );
  /** Invalid placeholder id → ids of the leaves skipped because of it. */
  const badPlaceholderRefs = new Map<string, string[]>();

  const leaves: TargetLeave[] = [];
  /** Missing user id → ids of the written leaves referencing it. */
  const placeholderRefs = new Map<string, string[]>();
  let skippedLeaves = 0;

  for (const doc of sourceLeaves) {
    const id = nonEmptyString(doc.id) ? doc.id : null;
    const rec = new RecordFindings('leaves', objectIdHex(doc._id), id);

    if (id === null) {
      rec.add('error', 'LEAVE_MISSING_ID', 'Leave has no id');
    } else {
      if ((idCounts.get(id) ?? 0) > 1)
        rec.add(
          'error',
          'LEAVE_DUPLICATE_ID',
          'Several source leaves have this id; none is migrated',
          { count: idCounts.get(id) },
        );
      if (!UUID.test(id))
        rec.add('warning', 'LEAVE_ID_NOT_UUID', 'Leave id is not a uuid; kept');
    }

    // References: missing source user → placeholder; skipped user → error.
    const requesterId = nonEmptyString(doc.requesterId)
      ? doc.requesterId
      : null;
    const approverId = nonEmptyString(doc.approverId) ? doc.approverId : null;
    if (requesterId === null) {
      rec.add('error', 'LEAVE_MISSING_REQUESTER', 'Leave has no requesterId');
    }
    const missingRefs: string[] = [];
    for (const [field, ref] of [
      ['requesterId', requesterId],
      ['approverId', approverId],
    ] as const) {
      if (ref === null) continue;
      if (userPass.skippedIds.has(ref)) {
        rec.add(
          'error',
          'LEAVE_USER_SKIPPED',
          `Leave ${field} refers to a user that was skipped for an error`,
          { field, userId: ref },
        );
      } else if (badPlaceholders.has(ref)) {
        rec.add(
          'error',
          'LEAVE_USER_SKIPPED',
          `Leave ${field} refers to a removed user whose placeholder cannot be created`,
          { field, userId: ref },
        );
        const refs = badPlaceholderRefs.get(ref) ?? [];
        const key = id ?? objectIdHex(doc._id) ?? '';
        if (!refs.includes(key)) refs.push(key);
        badPlaceholderRefs.set(ref, refs);
      } else if (!userPass.sourceIds.has(ref)) {
        missingRefs.push(ref);
      }
    }

    // Dates.
    const dates: Partial<Record<'startDate' | 'endDate', ConvertedDate>> = {};
    const notMidnight: Record<string, string> = {};
    for (const field of ['startDate', 'endDate'] as const) {
      const converted = toCalendarDate(doc[field], opts.timezone);
      if (converted === null) {
        rec.add(
          'error',
          'LEAVE_INVALID_DATE',
          `Leave ${field} is missing or invalid`,
          {
            field,
          },
        );
        continue;
      }
      dates[field] = converted;
      if (!converted.localMidnight)
        notMidnight[field] = (doc[field] as Date).toISOString();
    }
    if (Object.keys(notMidnight).length > 0) {
      rec.add(
        'warning',
        'LEAVE_DATE_NOT_LOCAL_MIDNIGHT',
        `Leave date is not local midnight in ${opts.timezone}; converted to the local calendar date`,
        {
          source: notMidnight,
          converted: Object.fromEntries(
            Object.keys(notMidnight).map((f) => [
              f,
              dates[f as 'startDate' | 'endDate']?.date,
            ]),
          ),
        },
      );
    }

    const isHalfDay = doc.isHalfDay === true;

    let type = LeaveType.ANNUAL;
    if (doc.type == null) {
      rec.add(
        'info',
        'LEAVE_TYPE_DEFAULTED',
        'Leave type missing; set to ANNUAL',
      );
    } else if ((Object.values(LeaveType) as unknown[]).includes(doc.type)) {
      type = doc.type as LeaveType;
    } else {
      rec.add('error', 'LEAVE_INVALID_TYPE', 'Leave type is not a known type', {
        type: doc.type,
      });
    }

    let state = LeaveState.PENDING;
    if (doc.state == null) {
      rec.add(
        'warning',
        'LEAVE_STATE_DEFAULTED',
        'Leave state missing; set to PENDING',
      );
    } else if ((Object.values(LeaveState) as unknown[]).includes(doc.state)) {
      state = doc.state as LeaveState;
    } else {
      rec.add(
        'error',
        'LEAVE_INVALID_STATE',
        'Leave state is not a known state',
        {
          state: doc.state,
        },
      );
    }

    const start = dates.startDate?.date;
    const end = dates.endDate?.date;
    if (start !== undefined && end !== undefined) {
      const rule = leaveDateRuleError({
        startDate: start,
        endDate: end,
        isHalfDay,
      });
      if (rule === ErrorCode.LEAVE_END_BEFORE_START) {
        rec.add('error', rule, 'Leave end date is before its start date', {
          startDate: start,
          endDate: end,
        });
      } else if (rule === ErrorCode.LEAVE_HALF_DAY_MULTIPLE_DAYS) {
        rec.add('error', rule, 'Half-day leave spans several days', {
          startDate: start,
          endDate: end,
        });
      }
    }

    if (
      rec.hasError ||
      start === undefined ||
      end === undefined ||
      id === null
    ) {
      skippedLeaves++;
      findings.push(...rec.settle());
      continue;
    }

    const numDays = leaveWorkDays({
      startDate: start,
      endDate: end,
      isHalfDay,
    });
    const oldNumDays = typeof doc.numDays === 'number' ? doc.numDays : null;
    if (oldNumDays !== numDays) {
      rec.add('info', 'LEAVE_NUMDAYS_CHANGED', 'Leave numDays recomputed', {
        old: oldNumDays,
        new: numDays,
      });
    }
    if (numDays === 0) {
      rec.add('info', 'LEAVE_ZERO_WORK_DAYS', 'Leave covers no work day');
    }

    const at = objectIdTime(doc._id, opts.runStartedAt);
    const target: TargetLeave = {
      id,
      requesterId: requesterId!,
      approverId,
      startDate: start,
      endDate: end,
      isHalfDay,
      type,
      state,
      numDays,
      createdAt: at,
      updatedAt: at,
    };
    const errors = schemaErrors(LeaveValidator, target);
    if (Object.keys(errors).length > 0) {
      rec.add('error', 'LEAVE_SCHEMA_INVALID', 'Leave fails the Leave schema', {
        errors,
      });
      skippedLeaves++;
      findings.push(...rec.settle());
      continue;
    }

    leaves.push(target);
    for (const ref of missingRefs) {
      const refs = placeholderRefs.get(ref) ?? [];
      if (!refs.includes(id)) refs.push(id);
      placeholderRefs.set(ref, refs);
    }
    findings.push(...rec.settle());
  }

  const placeholders = [...placeholderRefs.keys()].map((uid) =>
    placeholderUser(uid, opts.runStartedAt),
  );
  for (const [uid, leaveIds] of placeholderRefs) {
    findings.push({
      severity: 'warning',
      code: 'USER_PLACEHOLDER_CREATED',
      collection: 'users',
      sourceObjectId: null,
      recordId: uid,
      message:
        'Removed user referenced by leaves; deactivated placeholder created',
      details: { leaveIds },
      action: 'placeholder-created',
    });
  }

  for (const [uid, details] of badPlaceholders) {
    findings.push({
      severity: 'error',
      code: 'USER_PLACEHOLDER_INVALID',
      collection: 'users',
      sourceObjectId: null,
      recordId: uid,
      message:
        'Removed user referenced by leaves; placeholder cannot be created (invalid or duplicate email); referencing leaves skipped',
      details: { ...details, leaveIds: badPlaceholderRefs.get(uid) ?? [] },
      action: 'skipped',
    });
  }

  return {
    users: [...userPass.users, ...placeholders],
    placeholderUserIds: placeholders.map((p) => p.id),
    leaves,
    findings,
    source: { users: sourceUsers.length, leaves: sourceLeaves.length },
    skipped: { users: userPass.skipped, leaves: skippedLeaves },
    droppedFields: {
      degreesNonEmpty: sourceUsers.filter((u) => isNonEmpty(u.degrees)).length,
      addressNonEmpty: sourceUsers.filter((u) => isNonEmpty(u.address)).length,
    },
  };
}
