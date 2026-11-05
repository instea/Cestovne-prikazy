import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  IsString,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AppException } from './app-exception';
import { createValidationPipe } from './validation';

class Inner {
  @IsString({ message: 'inner.name must be a string' })
  name!: string;
}

class Outer {
  @ValidateNested()
  @Type(() => Inner)
  inner!: Inner;
}

@ValidatorConstraint({ name: 'alwaysFails' })
class AlwaysFails implements ValidatorConstraintInterface {
  validate(): boolean {
    return false;
  }
}

class WithCode {
  @Validate(AlwaysFails, {
    message: 'endDate must not be before startDate',
    context: { code: 'LEAVE_END_BEFORE_START' },
  })
  endDate!: string;
}

async function failureOf(metatype: new () => object, value: unknown) {
  try {
    await createValidationPipe().transform(value, { type: 'body', metatype });
  } catch (e) {
    if (e instanceof AppException) return e.body;
    throw e;
  }
  throw new Error('expected validation failure');
}

describe('createValidationPipe', () => {
  it('reports the first nested constraint', async () => {
    expect(await failureOf(Outer, { inner: { name: 1 } })).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'inner.name must be a string',
    });
  });

  it('uses a code carried in the validator context', async () => {
    expect(await failureOf(WithCode, { endDate: 'x' })).toEqual({
      statusCode: 400,
      code: 'LEAVE_END_BEFORE_START',
      message: 'endDate must not be before startDate',
    });
  });
});
