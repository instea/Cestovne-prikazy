import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { payloadTooLargeError, toErrorBody } from './error-mapping';

/**
 * Global filter for the app API. Attendance (ATT-01) and health-check (OPS-01)
 * bind their own controller-scoped filters, which take precedence.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toErrorBody(exception);
    const tooLarge = payloadTooLargeError(exception);
    if (tooLarge) {
      // A client problem, not a server fault: warn, no stack.
      this.logger.warn(
        `Request body is too large (${tooLarge.length ?? '?'} bytes, limit ${tooLarge.limit ?? '?'})`,
      );
    } else if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
      );
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(body.statusCode)
      .json(body);
  }
}
