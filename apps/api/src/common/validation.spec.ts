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
import { createValidationPipe, findReservedKey } from './validation';

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

class Named {
  @IsString()
  name!: string;
}

describe('reserved keys (__proto__ / constructor / prototype)', () => {
  it.each([
    ['{"__proto__":{"polluted":true},"name":"x"}', '__proto__'],
    ['{"constructor":"x","name":"x"}', 'constructor'],
    ['{"prototype":{},"name":"x"}', 'prototype'],
    ['{"name":"x","inner":{"__proto__":{}}}', 'inner.__proto__'],
    ['{"name":"x","list":[{"a":1},{"constructor":{}}]}', 'list.1.constructor'],
  ])('%s → 400 naming %s', async (json, path) => {
    expect(await failureOf(Named, JSON.parse(json))).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: `property ${path} should not exist`,
    });
  });

  it('rejects them in a nested DTO too', async () => {
    expect(
      await failureOf(
        Outer,
        JSON.parse('{"inner":{"name":"x","__proto__":{}}}'),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('accepts a value naming them (only keys count)', async () => {
    await expect(
      createValidationPipe().transform(
        { name: '__proto__' },
        { type: 'body', metatype: Named },
      ),
    ).resolves.toMatchObject({ name: '__proto__' });
  });

  it('leaves values without a DTO class alone (custom body pipes)', async () => {
    const raw = JSON.parse('{"__proto__":{}}') as object;
    await expect(
      createValidationPipe().transform(raw, { type: 'body', metatype: Object }),
    ).resolves.toBe(raw);
  });

  it('walks a deeply nested body without overflowing the stack', () => {
    let deep: unknown = { constructor: 1 };
    for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(findReservedKey(deep)).toMatch(/\.constructor$/);
  });
});
