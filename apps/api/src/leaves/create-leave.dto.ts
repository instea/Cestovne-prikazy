import type { CreateLeaveBody } from '@leaves/shared/dto';
import {
  LEAVE_DATE_RULE_MESSAGES,
  LEAVE_TYPES,
  leaveDateRuleError,
  LeaveType,
  type IsoDate,
} from '@leaves/shared/leaves';
import { isIsoDate } from '@leaves/shared/workdays';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { AppException } from '../common/app-exception';

/** A `YYYY-MM-DD` string naming a real calendar date (WD-01 `isIsoDate`). */
function IsIsoDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isIsoDate', validator: { validate: (v) => isIsoDate(v) } },
    options,
  );
}

/**
 * LV-01 `POST /api/leaves` body. The global pipe rejects unknown properties
 * (`numDays`, `state`, `requesterId`, `approverId`, `id`) with 400
 * `VALIDATION_FAILED`. The cross-field date rules run after this
 * (`assertLeaveDateRules`), so a malformed field always wins over them.
 */
export class CreateLeaveDto implements CreateLeaveBody {
  @IsIsoDate({ message: 'startDate must be a date in YYYY-MM-DD format' })
  startDate!: IsoDate;

  @IsIsoDate({ message: 'endDate must be a date in YYYY-MM-DD format' })
  endDate!: IsoDate;

  @IsOptional()
  @IsIn(LEAVE_TYPES, {
    message: `type must be one of ${LEAVE_TYPES.join(', ')}`,
  })
  type?: LeaveType;

  @IsOptional()
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
 * LV-01 cross-field rules (shared `leaveDateRuleError`): 400
 * `LEAVE_END_BEFORE_START`, else 400 `LEAVE_HALF_DAY_MULTIPLE_DAYS`. Both
 * dates must already be valid. Returns the input with defaults applied.
 */
export function assertLeaveDateRules(dto: CreateLeaveBody): NewLeaveInput {
  const input: NewLeaveInput = {
    startDate: dto.startDate,
    endDate: dto.endDate,
    type: dto.type ?? LeaveType.ANNUAL,
    isHalfDay: dto.isHalfDay ?? false,
  };
  const code = leaveDateRuleError(input);
  if (code) throw new AppException(400, code, LEAVE_DATE_RULE_MESSAGES[code]);
  return input;
}
