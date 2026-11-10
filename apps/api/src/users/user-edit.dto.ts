import { applyDecorators } from '@nestjs/common';
import { USER_NAME_MAX_LENGTH } from '@leaves/shared/users';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * USR-02 / USR-03 name field: optional (absent = unchanged), but when sent it
 * is a string, trimmed, 1–100 characters. `null` is rejected, not ignored.
 * The messages name the field (400 `VALIDATION_FAILED`).
 */
export function UserNameField(field: 'firstName' | 'surname') {
  return applyDecorators(
    ValidateIf((_o, value) => value !== undefined),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString({ message: `${field} must be a string` }),
    IsNotEmpty({ message: `${field} must not be empty` }),
    MaxLength(USER_NAME_MAX_LENGTH, {
      message: `${field} must be at most ${USER_NAME_MAX_LENGTH} characters`,
    }),
  );
}

/** USR-03 `PATCH /api/users/me` body (after `UserEditBodyPipe`). */
export class UpdateOwnProfileDto {
  @UserNameField('firstName')
  firstName?: string;

  @UserNameField('surname')
  surname?: string;
}

/**
 * USR-02 `PATCH /api/users/:id` body (after `UserEditBodyPipe`): names as
 * above, plus the admin flag (a real boolean, `null` rejected).
 */
export class AdminUpdateUserDto {
  @UserNameField('firstName')
  firstName?: string;

  @UserNameField('surname')
  surname?: string;

  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean({ message: 'isAdmin must be a boolean' })
  isAdmin?: boolean;
}
