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
  // AUTH-01 Google sign-in.
  LOGIN_FAILED: 'LOGIN_FAILED',
  WRONG_DOMAIN: 'WRONG_DOMAIN',
  // NFR-06 audit log query: `from` is after `to`.
  AUDIT_RANGE_INVALID: 'AUDIT_RANGE_INVALID',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error body returned by the app API (not by attendance or health-check). */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
}
