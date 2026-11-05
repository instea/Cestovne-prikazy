import { HttpException } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@leaves/shared/enums';
import { AppException } from './app-exception';

const INTERNAL: ApiErrorBody = {
  statusCode: 500,
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Internal server error',
};

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
