/**
 * Machine-readable error codes in every API error body
 * `{ statusCode, code, message }`. Feature tasks add their codes here.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // AUTH-02 session (access-token guard and POST /api/auth/refresh).
  ACCESS_TOKEN_INVALID: 'ACCESS_TOKEN_INVALID',
  ACCESS_TOKEN_EXPIRED: 'ACCESS_TOKEN_EXPIRED',
  REFRESH_TOKEN_MISSING: 'REFRESH_TOKEN_MISSING',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  // AUTH-05: deactivated user (guard, refresh, login).
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  // DATA-02 leave date rules (used by LV-01 and MIG-01).
  LEAVE_END_BEFORE_START: 'LEAVE_END_BEFORE_START',
  LEAVE_HALF_DAY_MULTIPLE_DAYS: 'LEAVE_HALF_DAY_MULTIPLE_DAYS',
  // LV-01 / LV-02: a new leave must be shorter than 2 years.
  LEAVE_TOO_LONG: 'LEAVE_TOO_LONG',
  // LV-03 / APR-01: no leave with this id.
  LEAVE_NOT_FOUND: 'LEAVE_NOT_FOUND',
  // AUTH-01 Google sign-in.
  LOGIN_FAILED: 'LOGIN_FAILED',
  WRONG_DOMAIN: 'WRONG_DOMAIN',
  // NFR-06 audit log query: `from` is after `to`.
  AUDIT_RANGE_INVALID: 'AUDIT_RANGE_INVALID',
  // USR-02 / USR-03: `email` (anyone) or `isAdmin` (own profile) in a user edit.
  FIELD_NOT_EDITABLE: 'FIELD_NOT_EDITABLE',
  // USR-02 / USR-04 / NFR-07: no user with the path `:id`.
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  // USR-02: an anonymized user (NFR-08) cannot be edited.
  USER_ANONYMIZED: 'USER_ANONYMIZED',
  // USR-04: the user is already deactivated.
  USER_ALREADY_DEACTIVATED: 'USER_ALREADY_DEACTIVATED',
  // SET-02: JSON request body over the body-parser limit (100 KB); 403.
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  // NFR-07: HEAD on the export route (no file build, no audit entry); 405.
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  // NFR-08 anonymization: already anonymized (409); `confirmEmail` is not the
  // stored email (400); the SSO directory still lists the email (409) or
  // cannot be read (503).
  USER_ALREADY_ANONYMIZED: 'USER_ALREADY_ANONYMIZED',
  CONFIRM_EMAIL_MISMATCH: 'CONFIRM_EMAIL_MISMATCH',
  SSO_EMPLOYEE_ACTIVE: 'SSO_EMPLOYEE_ACTIVE',
  SSO_UNAVAILABLE: 'SSO_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error body returned by the app API (not by attendance or health-check). */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
}
