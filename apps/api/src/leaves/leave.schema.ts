import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  LEAVE_DATE_RULE_MESSAGES,
  leaveDateRuleError,
  LeaveState,
  LeaveType,
  type IsoDate,
} from '@leaves/shared/leaves';
import { isIsoDate } from '@leaves/shared/workdays';
import type { HydratedDocument } from 'mongoose';

/** Path cast that accepts only strings (Mongoose would turn `42` into `"42"`). */
function stringOnly(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('must be a string');
  return value;
}

/** Path cast that accepts only booleans (Mongoose would turn `'yes'` into `true`). */
function booleanOnly(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('must be a boolean');
  return value;
}

/** Path cast that accepts only finite numbers (Mongoose would turn `'1'` into `1`). */
function numberOnly(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError('must be a finite number');
  return value;
}

const isoDateProp = (path: 'startDate' | 'endDate') => ({
  type: String,
  required: true,
  cast: stringOnly,
  validate: {
    validator: isIsoDate,
    message: `${path} must be a real YYYY-MM-DD date`,
  },
});

/**
 * DATA-02 Leave (collection `leaves`). Dates are calendar dates
 * (`YYYY-MM-DD`), stored as strings with no timezone conversion. Hard delete
 * (LV-03). Mongo `_id` / `__v` never leave the API (see `leave.mapper.ts`).
 */
@Schema({ collection: 'leaves', timestamps: true, strict: 'throw' })
export class Leave {
  // uuid v4 generated here (LV-01). No format validator: MIG-01 keeps legacy
  // ids that are not uuid v4 (warning LEAVE_ID_NOT_UUID).
  @Prop({
    type: String,
    required: true,
    unique: true,
    immutable: true,
    cast: stringOnly,
    default: () => randomUUID(),
  })
  id!: string;

  /** `User.id` of the requester (DATA-01); set by the server (LV-01). */
  @Prop({ type: String, required: true, cast: stringOnly })
  requesterId!: string;

  /** `User.id` of the last approver / rejecter (APR-*); `null` before. */
  @Prop({ type: String, default: null, cast: stringOnly })
  approverId!: string | null;

  @Prop(isoDateProp('startDate'))
  startDate!: IsoDate;

  @Prop(isoDateProp('endDate'))
  endDate!: IsoDate;

  @Prop({ type: Boolean, required: true, default: false, cast: booleanOnly })
  isHalfDay!: boolean;

  @Prop({
    type: String,
    required: true,
    default: LeaveType.ANNUAL,
    enum: Object.values(LeaveType),
  })
  type!: LeaveType;

  @Prop({
    type: String,
    required: true,
    default: LeaveState.PENDING,
    enum: Object.values(LeaveState),
  })
  state!: LeaveState;

  /** `leaveWorkDays()` (WD-01), computed by the server (LV-01, MIG-01). */
  @Prop({
    type: Number,
    required: true,
    cast: numberOnly,
    validate: {
      validator: (n: number) => n >= 0 && Number.isInteger(n * 2),
      message: 'numDays must be a non-negative multiple of 0.5',
    },
  })
  numDays!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type LeaveDocument = HydratedDocument<Leave>;

export const LeaveSchema = SchemaFactory.createForClass(Leave);

LeaveSchema.index({ requesterId: 1, startDate: 1 }); // SUM-01, ATT-*, GDPR export
LeaveSchema.index({ state: 1, startDate: 1 }); // LST-01, APR-02, attendance
LeaveSchema.index({ startDate: 1, endDate: 1 }); // overlap queries

// Cross-field rules (shared `leaveDateRuleError`, also used by LV-01 and
// MIG-01). Only checked when both dates are valid (else the path validators
// above already report them). One error at a time: END_BEFORE_START wins.
LeaveSchema.pre('validate', function () {
  if (!isIsoDate(this.startDate) || !isIsoDate(this.endDate)) return;
  const code = leaveDateRuleError(this);
  if (code == null) return;
  this.invalidate(
    code === 'LEAVE_END_BEFORE_START' ? 'endDate' : 'isHalfDay',
    LEAVE_DATE_RULE_MESSAGES[code],
  );
});

// Query updates run the path validators (enum, date format, numDays, casts).
// Mongoose never runs the document pre('validate') hook for queries, so the
// cross-field date rules above are NOT checked there: query updates must not
// change startDate / endDate / isHalfDay (APR-* only sets state/approverId).
// A future date edit must load the document and save() it, or call
// leaveDateRuleError() on the merged values first.
LeaveSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
  ],
  function () {
    this.setOptions({ runValidators: true });
  },
);
