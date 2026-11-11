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

/** An http-errors error thrown by body-parser (`type` names the case). */
interface BodyParserError {
  type: string;
  message?: string;
  length?: number;
  limit?: number;
}

const isBodyParserError = (e: unknown, type: string): e is BodyParserError =>
  typeof e === 'object' &&
  e !== null &&
  (e as { type?: unknown }).type === type;

/**
 * body-parser's error of `type`, as thrown or as the `cause` of the
 * `HttpException` Nest's Express adapter wraps it in.
 */
function bodyParserError(
  exception: unknown,
  type: string,
): BodyParserError | null {
  if (isBodyParserError(exception, type)) return exception;
  const cause = (exception as { cause?: unknown } | null)?.cause;
  return isBodyParserError(cause, type) ? cause : null;
}

/** body-parser's `entity.too.large` (http-errors 413). */
export function payloadTooLargeError(
  exception: unknown,
): BodyParserError | null {
  return bodyParserError(exception, 'entity.too.large');
}

/**
 * body-parser's 415 for a JSON body it cannot decode → 400
 * `VALIDATION_FAILED` (user decision; like malformed JSON, a client error
 * found before routing, not a 500).
 */
const UNSUPPORTED_BODY_MESSAGES = {
  'charset.unsupported': 'Unsupported request body charset',
  'encoding.unsupported': 'Unsupported request body content encoding',
} as const;

/**
 * The 400 body and body-parser's own reason (e.g. `unsupported charset
 * "LATIN2"`, for the log) of an undecodable request body, else `null`.
 */
export function unsupportedBodyError(
  exception: unknown,
): { body: ApiErrorBody; reason: string } | null {
  for (const [type, message] of Object.entries(UNSUPPORTED_BODY_MESSAGES)) {
    const error = bodyParserError(exception, type);
    if (error) {
      return {
        body: { statusCode: 400, code: ErrorCode.VALIDATION_FAILED, message },
        reason: error.message ?? type,
      };
    }
  }
  return null;
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
  const unsupported = unsupportedBodyError(exception);
  if (unsupported) return unsupported.body;
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
