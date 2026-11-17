import type { CreateLeaveBody } from '@leaves/shared/dto';
import {
  LEAVE_DATE_RULE_MESSAGES,
  LEAVE_MAX_DATE,
  LEAVE_MIN_DATE,
  LEAVE_TYPES,
  leaveDateFieldError,
  type LeaveDateField,
  LeaveType,
  newLeaveRuleError,
  type IsoDate,
} from '@leaves/shared/leaves';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, ValidateBy, ValidateIf } from 'class-validator';
import { AppException } from '../common/app-exception';

/**
 * A real `YYYY-MM-DD` date within 2000-01-01..2100-12-31 (shared
 * `leaveDateFieldError`, which also gives the field-specific message).
 */
function IsLeaveDate(field: LeaveDateField): PropertyDecorator {
  const docs = ApiProperty({
    type: 'string',
    format: 'date',
    example: '2026-12-01',
    description: `\`YYYY-MM-DD\`, ${LEAVE_MIN_DATE}..${LEAVE_MAX_DATE}.`,
  });
  const validate = ValidateBy({
    name: 'isLeaveDate',
    validator: {
      validate: (v) => leaveDateFieldError(field, v) === null,
      defaultMessage: (args) =>
        leaveDateFieldError(field, args?.value) ?? 'Invalid date',
    },
  });
  return (target, key) => {
    docs(target, key);
    validate(target, key);
  };
}

/** Values of the optional fields when absent (validator and OpenAPI `default`). */
export const LEAVE_DEFAULTS = {
  type: LeaveType.ANNUAL,
  isHalfDay: false,
} as const satisfies Required<Pick<CreateLeaveBody, 'type' | 'isHalfDay'>>;

/** Optional, but not nullable: absent → default, `null` → 400. */
const IsAbsentOrValidated = () =>
  ValidateIf((_obj, value) => value !== undefined);

/**
 * LV-01 `POST /api/leaves` body. The global pipe rejects unknown properties
 * (`numDays`, `state`, `requesterId`, `approverId`, `id`) with 400
 * `VALIDATION_FAILED`, as a date outside 2000..2100 and a `null` `type` /
 * `isHalfDay` (absent means the default). The cross-field date rules run
 * after this (`assertLeaveDateRules`), so a malformed field always wins.
 */
export class CreateLeaveDto implements CreateLeaveBody {
  @IsLeaveDate('startDate')
  startDate!: IsoDate;

  @IsLeaveDate('endDate')
  endDate!: IsoDate;

  @ApiPropertyOptional({
    enum: LEAVE_TYPES,
    enumName: 'LeaveType',
    default: LEAVE_DEFAULTS.type,
  })
  @IsAbsentOrValidated()
  @IsIn(LEAVE_TYPES, {
    message: `type must be one of ${LEAVE_TYPES.join(', ')}`,
  })
  type?: LeaveType;

  @ApiPropertyOptional({
    default: LEAVE_DEFAULTS.isHalfDay,
    description: '`true` only for a single-day leave.',
  })
  @IsAbsentOrValidated()
  @IsBoolean({ message: 'isHalfDay must be a boolean' })
  isHalfDay?: boolean;
}

/** The validated body with defaults applied (`type` ANNUAL, full day). */
export interface NewLeaveInput {
  startDate: IsoDate;
  endDate: IsoDate;
  type: LeaveType;
  isHalfDay: boolean;
}

/**
 * LV-01 cross-field rules (shared `newLeaveRuleError`): 400
 * `LEAVE_END_BEFORE_START`, else 400 `LEAVE_TOO_LONG`, else 400
 * `LEAVE_HALF_DAY_MULTIPLE_DAYS`. Both dates must already be valid and in
 * range. Returns the input with defaults applied.
 */
export function assertLeaveDateRules(dto: CreateLeaveBody): NewLeaveInput {
  const input: NewLeaveInput = {
    startDate: dto.startDate,
    endDate: dto.endDate,
    type: dto.type ?? LEAVE_DEFAULTS.type,
    isHalfDay: dto.isHalfDay ?? LEAVE_DEFAULTS.isHalfDay,
  };
  const code = newLeaveRuleError(input);
  if (code) throw new AppException(400, code, LEAVE_DATE_RULE_MESSAGES[code]);
  return input;
}
