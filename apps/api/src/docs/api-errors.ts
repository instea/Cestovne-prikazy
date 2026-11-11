import { SetMetadata } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { LEAVE_DATE_RULE_MESSAGES } from '@leaves/shared/leaves';

/**
 * DOC-02: the error answers of one operation, `[status, code]`. Declared on
 * the handler with `@ApiErrors(...)`; the OpenAPI builder (`openapi.ts`)
 * turns them into `ErrorBody` responses with examples and lists the codes
 * in the operation description. The errors every app API route shares are
 * added there, not here:
 * - from the access level (NFR-01): `user` → `SESSION_ERRORS`, `admin` →
 *   also 403 `FORBIDDEN`;
 * - on every route: `PRE_ROUTING_ERRORS`;
 * - on every `/api` route except attendance: `INTERNAL_ERRORS`.
 */
export type ApiError = readonly [status: number, code: ErrorCode];

export const API_ERRORS = 'docs:errors';

export const ApiErrors = (...errors: ApiError[]) =>
  SetMetadata(API_ERRORS, errors);

/** Access-token guard (AUTH-02 / AUTH-05) on `user` and `admin` routes. */
export const SESSION_ERRORS: readonly ApiError[] = [
  [401, ErrorCode.AUTH_REQUIRED],
  [401, ErrorCode.ACCESS_TOKEN_INVALID],
  [401, ErrorCode.ACCESS_TOKEN_EXPIRED],
  [401, ErrorCode.USER_DEACTIVATED],
];

/** `RolesGuard` on `admin` routes. */
export const ADMIN_ERRORS: readonly ApiError[] = [
  ...SESSION_ERRORS,
  [403, ErrorCode.FORBIDDEN],
];

/**
 * Every route, incl. attendance and the health check: the JSON body parser
 * runs before routing and authentication, so its errors are app-wide
 * `ErrorBody` answers (SET-02), also where the route answers other bodies:
 * - 400 `VALIDATION_FAILED`: malformed JSON, or a charset / content
 *   encoding the parser does not support (body-parser's 415, user decision);
 * - 403 `PAYLOAD_TOO_LARGE`: a JSON body over 100 KB (user decision).
 */
export const PRE_ROUTING_ERRORS: readonly ApiError[] = [
  [400, ErrorCode.VALIDATION_FAILED],
  [403, ErrorCode.PAYLOAD_TOO_LARGE],
];

export const isPreRoutingError = ([status, code]: ApiError): boolean =>
  PRE_ROUTING_ERRORS.some(([s, c]) => s === status && c === code);

/**
 * App API routes (`/api` except attendance, which answers its own 500
 * body): an unexpected failure.
 */
export const INTERNAL_ERRORS: readonly ApiError[] = [
  [500, ErrorCode.INTERNAL_ERROR],
];

/** One example `message` per code (the API's own wording). */
export const ERROR_EXAMPLE_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'property foo should not exist',
  AUTH_REQUIRED: 'Authentication required',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Route not found',
  INTERNAL_ERROR: 'Internal server error',
  ACCESS_TOKEN_INVALID: 'Access token is invalid',
  ACCESS_TOKEN_EXPIRED: 'Access token has expired',
  REFRESH_TOKEN_MISSING: 'Refresh token missing',
  REFRESH_TOKEN_INVALID: 'Refresh token is invalid',
  REFRESH_TOKEN_REUSED: 'Refresh token was already used',
  REFRESH_TOKEN_EXPIRED: 'Refresh token has expired',
  USER_DEACTIVATED: 'User account is deactivated',
  ...LEAVE_DATE_RULE_MESSAGES,
  LEAVE_NOT_FOUND: 'Leave not found',
  LOGIN_FAILED: 'Google ID token is invalid',
  WRONG_DOMAIN: 'Email does not belong to the hosted domain',
  AUDIT_RANGE_INVALID: 'from must not be after to',
  FIELD_NOT_EDITABLE: 'email cannot be changed',
  USER_NOT_FOUND: 'User not found',
  USER_ANONYMIZED: 'An anonymized user cannot be changed',
  USER_ALREADY_DEACTIVATED: 'User is already deactivated',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  METHOD_NOT_ALLOWED: 'Method not allowed',
  USER_ALREADY_ANONYMIZED: 'User is already anonymized',
  CONFIRM_EMAIL_MISMATCH: 'confirmEmail does not match the user email',
  SSO_EMPLOYEE_ACTIVE: 'The SSO directory still lists this user',
  SSO_UNAVAILABLE: 'The SSO directory is not reachable',
};
