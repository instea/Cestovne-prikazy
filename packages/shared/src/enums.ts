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
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error body returned by the app API (not by attendance or health-check). */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
}
