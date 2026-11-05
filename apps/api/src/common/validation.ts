import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { AppException } from './app-exception';

interface Failure {
  message: string;
  code: ErrorCode;
}

/** Depth-first first failing constraint. A validator may carry `context.code`. */
function firstFailure(errors: ValidationError[]): Failure | undefined {
  for (const error of errors) {
    const [name, message] = Object.entries(error.constraints ?? {})[0] ?? [];
    if (name !== undefined && message !== undefined) {
      const code = (error.contexts?.[name] as { code?: ErrorCode } | undefined)
        ?.code;
      return { message, code: code ?? ErrorCode.VALIDATION_FAILED };
    }
    const nested = firstFailure(error.children ?? []);
    if (nested) return nested;
  }
  return undefined;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory(errors) {
      const failure = firstFailure(errors) ?? {
        message: 'Validation failed',
        code: ErrorCode.VALIDATION_FAILED,
      };
      return new AppException(400, failure.code, failure.message);
    },
  });
}
