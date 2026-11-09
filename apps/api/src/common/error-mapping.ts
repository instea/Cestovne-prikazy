import { HttpException } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@leaves/shared/enums';
import { AppException } from './app-exception';

const INTERNAL: ApiErrorBody = {
  statusCode: 500,
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Internal server error',
};

/** SET-02: JSON body over the 100 KB limit (user decision: 403, not 413). */
const PAYLOAD_TOO_LARGE: ApiErrorBody = {
  statusCode: 403,
  code: ErrorCode.PAYLOAD_TOO_LARGE,
  message: 'Request body is too large',
};

interface BodyParserError {
  type: 'entity.too.large';
  length?: number;
  limit?: number;
}

const isTooLarge = (e: unknown): e is BodyParserError =>
  typeof e === 'object' &&
  e !== null &&
  (e as { type?: unknown }).type === 'entity.too.large';

/**
 * body-parser's `entity.too.large` error (http-errors 413), as thrown or as
 * the `cause` of the 413 `HttpException` Nest's Express adapter wraps it in.
 */
export function payloadTooLargeError(
  exception: unknown,
): BodyParserError | null {
  if (isTooLarge(exception)) return exception;
  const cause = (exception as { cause?: unknown } | null)?.cause;
  return isTooLarge(cause) ? cause : null;
}

/** First human-readable message of a bare Nest HttpException. */
function messageOf(e: HttpException): string {
  const response = e.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const m: unknown = response.message;
    if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
    if (typeof m === 'string') return m;
  }
  return e.message;
}

/**
 * Map any thrown value to the API error body (SET-02 table). Stacks and
 * internal messages never leave the server.
 */
export function toErrorBody(exception: unknown): ApiErrorBody {
  if (exception instanceof AppException) return exception.body;
  if (payloadTooLargeError(exception)) return PAYLOAD_TOO_LARGE;
  if (!(exception instanceof HttpException)) return INTERNAL;
  switch (exception.getStatus()) {
    case 400:
      return {
        statusCode: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: messageOf(exception),
      };
    case 401:
      return {
        statusCode: 401,
        code: ErrorCode.AUTH_REQUIRED,
        message: 'Authentication required',
      };
    case 403:
      return {
        statusCode: 403,
        code: ErrorCode.FORBIDDEN,
        message: 'Forbidden',
      };
    case 404:
      return {
        statusCode: 404,
        code: ErrorCode.NOT_FOUND,
        message: 'Route not found',
      };
    default:
      return INTERNAL;
  }
}
