import {
  type ArgumentMetadata,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
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

/**
 * Keys that class-transformer silently drops (prototype-pollution guard), so
 * the whitelist never reports them and `{"__proto__": …}` would pass.
 */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Path of the first own reserved key in `value`, nested objects and arrays
 * included (iterative: a deeply nested body cannot overflow the stack).
 */
export function findReservedKey(value: unknown): string | undefined {
  const stack: { value: unknown; path: string }[] = [{ value, path: '' }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (typeof item.value !== 'object' || item.value === null) continue;
    for (const key of Object.keys(item.value)) {
      const path = item.path ? `${item.path}.${key}` : key;
      if (RESERVED_KEYS.has(key)) return path;
      stack.push({
        value: (item.value as Record<string, unknown>)[key],
        path,
      });
    }
  }
  return undefined;
}

/**
 * 400 `VALIDATION_FAILED` for a reserved key anywhere in `value` (an unknown
 * property, like any other), worded like the whitelist message.
 */
export function assertNoReservedKeys(value: unknown): void {
  const key = findReservedKey(value);
  if (key !== undefined) {
    throw new AppException(
      400,
      ErrorCode.VALIDATION_FAILED,
      `property ${key} should not exist`,
    );
  }
}

/** Also rejects reserved keys in every value it validates against a DTO. */
class AppValidationPipe extends ValidationPipe {
  override async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if (this.toValidate(metadata)) assertNoReservedKeys(value);
    return super.transform(value, metadata) as Promise<unknown>;
  }
}

export function createValidationPipe(): ValidationPipe {
  return new AppValidationPipe({
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
