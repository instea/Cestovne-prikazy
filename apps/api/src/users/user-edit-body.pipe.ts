import { type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import { AppException } from '../common/app-exception';
import { createValidationPipe } from '../common/validation';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Body pipe of the user-edit endpoints (USR-03 `PATCH /api/users/me`, later
 * USR-02 `PATCH /api/users/:id`), in this order:
 * 1. a non-object body → 400 `VALIDATION_FAILED`;
 * 2. any `nonEditable` property present → 403 `FIELD_NOT_EDITABLE` (wins
 *    over every other problem in the same body, so a forbidden field is
 *    never reported as a mere validation error);
 * 3. the DTO's own validation (whitelist: other unknown properties → 400);
 * 4. no field left → 400 `VALIDATION_FAILED` (at least one is required).
 *
 * Use it on a parameter typed with an interface / `Record` (not the DTO
 * class), so the global validation pipe skips the raw body and step 2 runs
 * before the whitelist check would answer 400 for those properties.
 */
export class UserEditBodyPipe<T extends object> implements PipeTransform {
  private readonly validation = createValidationPipe();

  constructor(
    private readonly dto: new () => T,
    private readonly nonEditable: readonly string[],
  ) {}

  async transform(value: unknown): Promise<T> {
    if (!isPlainObject(value)) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_FAILED,
        'Body must be a JSON object',
      );
    }
    const forbidden = this.nonEditable.find((field) =>
      Object.hasOwn(value, field),
    );
    if (forbidden !== undefined) {
      throw new AppException(
        403,
        ErrorCode.FIELD_NOT_EDITABLE,
        `${forbidden} cannot be changed`,
      );
    }
    const dto = (await this.validation.transform(value, {
      type: 'body',
      metatype: this.dto,
    })) as T;
    if (Object.values(dto).every((v) => v === undefined)) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_FAILED,
        'At least one field is required',
      );
    }
    return dto;
  }
}
