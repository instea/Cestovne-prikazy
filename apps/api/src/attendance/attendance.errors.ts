import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { SsoUnavailableError } from './sso/sso.client';
import { TogglUnavailableError } from './toggl/toggl.client';

/**
 * ATT-01 error contract (old Express handler), not the app's
 * `{ statusCode, code, message }` convention:
 * - 401: empty body, no `WWW-Authenticate`;
 * - 400 / 500: `{"message": "..."}`;
 * - anything unexpected: 500 `{"message":"Internal server error"}` (safe
 *   fix; old code hung the request).
 */

/** Missing or wrong M2M Basic credentials. */
export class M2mUnauthorizedError extends Error {
  constructor() {
    super('M2M authentication failed');
    this.name = 'M2mUnauthorizedError';
  }
}

/** Invalid `:year` / `:month` path param (old texts). */
export class AttendanceParamError extends Error {
  static readonly MONTH = 'Month is not a number.';
  static readonly YEAR = 'Year is not a number.';

  constructor(message: string) {
    super(message);
    this.name = 'AttendanceParamError';
  }
}

export const INTERNAL_ERROR_MESSAGE = 'Internal server error';

/** JSON written as `JSON.stringify` bytes with the old Express content type. */
export function sendJson(res: Response, status: number, body: unknown): void {
  res
    .status(status)
    .set('Content-Type', 'application/json; charset=utf-8')
    .send(JSON.stringify(body));
}

/** Controller-scoped; takes precedence over the global `AllExceptionsFilter`. */
@Catch()
export class AttendanceExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Attendance');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof M2mUnauthorizedError) {
      res.status(401).end();
      return;
    }
    if (exception instanceof AttendanceParamError) {
      sendJson(res, 400, { message: exception.message });
      return;
    }
    if (
      exception instanceof SsoUnavailableError ||
      exception instanceof TogglUnavailableError
    ) {
      // The clients already logged the reason (without credentials).
      sendJson(res, 500, { message: exception.message });
      return;
    }
    this.logger.error(
      `Attendance request failed: ${
        exception instanceof Error
          ? (exception.stack ?? `${exception.name}: ${exception.message}`)
          : String(exception)
      }`,
    );
    sendJson(res, 500, { message: INTERNAL_ERROR_MESSAGE });
  }
}
