import { HttpException } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@leaves/shared/enums';

/**
 * The only exception feature code throws for expected errors. Its body is
 * returned as is: `{ statusCode, code, message }`.
 */
export class AppException extends HttpException {
  constructor(
    statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super({ statusCode, code, message } satisfies ApiErrorBody, statusCode);
  }

  get body(): ApiErrorBody {
    return {
      statusCode: this.getStatus(),
      code: this.code,
      message: this.message,
    };
  }
}
