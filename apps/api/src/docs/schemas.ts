import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
  type AuditEntryDto,
  type AuditPageDto,
} from '@leaves/shared/audit';
import type {
  AuthConfigDto,
  LeaveDto,
  LeaveSummaryDto,
  LeaveSummaryTypeDto,
  LeaveSummaryYearDto,
  SessionDto,
  UserDto,
  UserRefDto,
} from '@leaves/shared/dto';
import { type ApiErrorBody, ErrorCode } from '@leaves/shared/enums';
import { LEAVE_STATES, LEAVE_TYPES } from '@leaves/shared/leaves';
import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';
import type {
  AttendanceDay,
  AttendanceEntry,
  AttendanceResponse,
} from '../attendance/attendance.assembly';
import type {
  ExportAuditEntry,
  ExportLeave,
  UserExportFile,
} from '../users/user-export';

/**
 * DOC-02 component schemas of the response bodies. The response DTOs are
 * shared TypeScript interfaces (`@leaves/shared`), which carry no runtime
 * metadata, so their schemas are written here; `objectSchema<T>` makes the
 * compiler require exactly the interface's properties, with `nullable(...)`
 * exactly on the `| null` ones and the optional list exactly the `?` ones
 * (type tests: `schemas.spec.ts`). Request bodies are DTO classes with
 * `@ApiProperty` (next to their validators).
 */

export type Schema = SchemaObject | ReferenceObject;

/** `$ref` inside `SCHEMAS` (redocly lint fails on an unresolved one). */
const schemaRef = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

/** Type-only brand of a `nullable(...)` schema (no runtime property). */
declare const NULLABLE: unique symbol;
export type NullableSchema = Schema & { readonly [NULLABLE]: true };
/** Any schema not made by `nullable(...)`. */
export type NonNullSchema = Schema & { readonly [NULLABLE]?: never };

export const nullable = (schema: Schema): NullableSchema =>
  ('$ref' in schema
    ? { oneOf: [schema, { type: 'null' }] }
    : {
        ...schema,
        type: [schema.type as string, 'null'],
      }) as NullableSchema;

const string = (description?: string): SchemaObject => ({
  type: 'string',
  ...(description ? { description } : {}),
});
const dateTime = (description?: string): SchemaObject => ({
  ...string(description),
  format: 'date-time',
});
const date = (description?: string): SchemaObject => ({
  ...string(description),
  format: 'date',
  example: '2026-12-01',
});
const boolean: SchemaObject = { type: 'boolean' };
const integer = (description?: string): SchemaObject => ({
  type: 'integer',
  ...(description ? { description } : {}),
});
const number = (description?: string): SchemaObject => ({
  type: 'number',
  ...(description ? { description } : {}),
});
const arrayOf = (items: Schema): SchemaObject => ({ type: 'array', items });
const freeObject = (description: string): SchemaObject => ({
  type: 'object',
  additionalProperties: true,
  description,
});

/** The keys of `T` declared with `?`. */
export type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];

/** Every ordering of the union `U` as a tuple (`never` → `[]`). */
type Permutations<U, A = U> = [U] extends [never]
  ? []
  : A extends unknown
    ? [A, ...Permutations<Exclude<U, A>>]
    : never;

/**
 * Per property of `T`: `nullable(...)` exactly when `T`'s type includes
 * `null` (a plain schema there, or `nullable` elsewhere, fails to compile);
 * an `unknown` property takes any schema.
 */
export type PropertySchemas<T> = {
  [K in keyof Required<T>]-?: unknown extends T[K]
    ? Schema
    : null extends T[K]
      ? NullableSchema
      : NonNullSchema;
};

/** The optional-key list: exactly `T`'s `?` keys, each once (any order). */
export type OptionalList<T> = [OptionalKeys<T>] extends [never]
  ? [] | [optional: readonly []]
  : [optional: Readonly<Permutations<OptionalKeys<T>>>];

/**
 * Object schema with exactly `T`'s properties; all required except the
 * optional list, which must name exactly `T`'s optional properties.
 */
export function objectSchema<T>(
  description: string,
  properties: PropertySchemas<T>,
  ...[optional = []]: OptionalList<T>
): SchemaObject {
  const keys = Object.keys(properties);
  const notRequired = optional as readonly unknown[] as readonly PropertyKey[];
  return {
    type: 'object',
    description,
    properties,
    required: keys.filter((k) => !notRequired.includes(k)),
    additionalProperties: false,
  };
}

const auditDetails = nullable(
  freeObject('Action-specific details (NFR-06), e.g. changed fields.'),
);

export const SCHEMAS = {
  ErrorBody: objectSchema<ApiErrorBody>(
    'Error body of every app API error (not used by the attendance API and the health check).',
    {
      statusCode: { ...integer('HTTP status code.'), example: 404 },
      code: {
        type: 'string',
        enum: Object.values(ErrorCode),
        description: 'Machine-readable error code (shared `ErrorCode`).',
      },
      message: string('Human-readable English message.'),
    },
  ),
  LeaveType: { type: 'string', enum: [...LEAVE_TYPES] },
  LeaveState: { type: 'string', enum: [...LEAVE_STATES] },
  AuthConfigDto: objectSchema<AuthConfigDto>(
    'Settings the SPA needs before sign-in (AUTH-01).',
    {
      googleClientId: string('Google OAuth client id.'),
      hostedDomain: {
        ...string('Google Workspace domain.'),
        example: 'instea.co',
      },
    },
  ),
  UserDto: objectSchema<UserDto>('A user (DATA-01).', {
    id: string('Google account id (`sub`).'),
    email: { ...string(), format: 'email' },
    firstName: string(),
    surname: string(),
    isAdmin: boolean,
    active: { ...boolean, description: '`false` once deactivated (USR-04).' },
    deactivatedAt: nullable(dateTime()),
    anonymizedAt: nullable(dateTime('Set by the GDPR erasure (NFR-08).')),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  }),
  UserRefDto: objectSchema<UserRefDto>(
    'A user embedded in another object; never carries the email.',
    {
      id: string(),
      firstName: string(),
      surname: string(),
      active: boolean,
      anonymized: boolean,
    },
  ),
  SessionDto: objectSchema<SessionDto>(
    'Session started by the Google login or a refresh (AUTH-02). The refresh token is set in the `refresh_token` cookie.',
    {
      accessToken: string('JWT for the `Authorization: Bearer` header.'),
      accessTokenExpiresAt: dateTime(),
      user: schemaRef('UserDto'),
    },
  ),
  LeaveDto: objectSchema<LeaveDto>('A leave (DATA-02).', {
    id: string(),
    requester: nullable(schemaRef('UserRefDto')),
    approver: nullable(schemaRef('UserRefDto')),
    startDate: date(),
    endDate: date(),
    isHalfDay: boolean,
    type: schemaRef('LeaveType'),
    state: schemaRef('LeaveState'),
    numDays: number('Work days of the leave (0.5 for a half day).'),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  }),
  LeaveSummaryTypeDto: objectSchema<LeaveSummaryTypeDto>(
    'Work days of one leave type in one year.',
    { type: schemaRef('LeaveType'), workDays: number() },
  ),
  LeaveSummaryYearDto: objectSchema<LeaveSummaryYearDto>(
    'One year; `byType` is empty without approved leaves.',
    { year: integer(), byType: arrayOf(schemaRef('LeaveSummaryTypeDto')) },
  ),
  LeaveSummaryDto: objectSchema<LeaveSummaryDto>(
    "The caller's approved leaves per year (descending) and type (SUM-01).",
    { years: arrayOf(schemaRef('LeaveSummaryYearDto')) },
  ),
  AuditEntryDto: objectSchema<AuditEntryDto>('An audit log entry (NFR-06).', {
    id: string(),
    at: dateTime(),
    actorType: { type: 'string', enum: [...AUDIT_ACTOR_TYPES] },
    actorId: nullable(string()),
    actor: nullable(schemaRef('UserRefDto')),
    action: { type: 'string', enum: [...AUDIT_ACTIONS] },
    targetType: { type: 'string', enum: [...AUDIT_TARGET_TYPES] },
    targetId: string(),
    details: auditDetails,
  }),
  AuditPageDto: objectSchema<AuditPageDto>(
    'One page of audit entries, newest first.',
    {
      items: arrayOf(schemaRef('AuditEntryDto')),
      page: integer(),
      pageSize: integer(),
      total: integer('Entries matching the filters.'),
    },
  ),
  ExportLeave: objectSchema<ExportLeave>('A leave in the GDPR export.', {
    id: string(),
    requesterId: string(),
    approverId: nullable(string()),
    startDate: date(),
    endDate: date(),
    isHalfDay: boolean,
    type: schemaRef('LeaveType'),
    state: schemaRef('LeaveState'),
    numDays: number(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  }),
  ExportAuditEntry: objectSchema<ExportAuditEntry>(
    'An audit entry in the GDPR export.',
    {
      id: string(),
      at: dateTime(),
      actorType: { type: 'string', enum: [...AUDIT_ACTOR_TYPES] },
      actorId: nullable(string()),
      action: { type: 'string', enum: [...AUDIT_ACTIONS] },
      targetType: { type: 'string', enum: [...AUDIT_TARGET_TYPES] },
      targetId: string(),
      details: auditDetails,
      redacted: {
        ...boolean,
        description:
          "`true`: `details` held another user's data and was removed.",
      },
    },
  ),
  UserExportFile: objectSchema<UserExportFile>(
    "GDPR export of one user's data (NFR-07), sent as a JSON attachment.",
    {
      formatVersion: { type: 'integer', enum: [1] },
      exportedAt: dateTime(),
      exportedBy: string('Id of the exporting admin.'),
      user: schemaRef('UserDto'),
      leavesAsRequester: arrayOf(schemaRef('ExportLeave')),
      leavesAsApprover: arrayOf(schemaRef('ExportLeave')),
      auditEntries: arrayOf(schemaRef('ExportAuditEntry')),
    },
  ),
  HealthCheck: {
    type: 'object',
    description: 'Readiness probe body (OPS-01, old format).',
    properties: {
      checkMongo: string('`ok`, or the database error message.'),
    },
    required: ['checkMongo'],
    additionalProperties: false,
  },
  AttendanceDay: objectSchema<AttendanceDay>(
    'One day of the month (index 0 = day 1).',
    {
      logged_time: number('Hours logged in Toggl.'),
      leave: string(
        'Codes of the approved leaves on this work day, comma-separated (`D8` annual, `D4` annual half day, `PN` sickness, `L` doctor, `I` other); empty when none, or when the month param is not an integer 1–12.',
      ),
    },
  ),
  AttendanceEntry: objectSchema<AttendanceEntry>(
    'Attendance of one employee.',
    {
      days: arrayOf(schemaRef('AttendanceDay')),
      total: number('Hours logged in the month.'),
      contractType: {
        description:
          'Contract type from the SSO directory; absent when SSO has none.',
      },
    },
    ['contractType'],
  ),
  AttendanceResponse: objectSchema<AttendanceResponse>(
    'Monthly attendance of all employees (ATT-01, old format).',
    {
      start: date('First day of the month.'),
      end: date('Last day of the month.'),
      attendence: {
        type: 'object',
        description: 'Keyed by the employee name from the SSO directory.',
        additionalProperties: schemaRef('AttendanceEntry'),
      },
    },
  ),
  AttendanceError: {
    type: 'object',
    description: 'Attendance error body (old contract, not `ErrorBody`).',
    properties: { message: string() },
    required: ['message'],
    additionalProperties: false,
  },
} satisfies Record<string, SchemaObject>;

export type SchemaName = keyof typeof SCHEMAS;

export const ref = (name: SchemaName): ReferenceObject => schemaRef(name);
