import 'reflect-metadata';
import type { ApiErrorBody } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import { UpdateOwnProfileDto } from './user-edit.dto';
import { UserEditBodyPipe } from './user-edit-body.pipe';

const pipe = new UserEditBodyPipe(UpdateOwnProfileDto, ['email', 'isAdmin']);

async function failure(value: unknown): Promise<ApiErrorBody> {
  try {
    await pipe.transform(value);
  } catch (e) {
    if (e instanceof AppException) return e.body;
    throw e;
  }
  throw new Error('expected a failure');
}

describe('UserEditBodyPipe (USR-03 body)', () => {
  it('returns the trimmed names', async () => {
    await expect(
      pipe.transform({ firstName: '  Jana ', surname: 'Nová' }),
    ).resolves.toMatchObject({ firstName: 'Jana', surname: 'Nová' });
    const onlySurname = await pipe.transform({ surname: 'Nová' });
    expect(onlySurname.surname).toBe('Nová');
    expect(onlySurname.firstName).toBeUndefined();
  });

  it.each(['email', 'isAdmin'])(
    '%s → 403 FIELD_NOT_EDITABLE, even next to other problems',
    async (field) => {
      for (const body of [
        { [field]: 'x' },
        { [field]: true, firstName: 'Jana' },
        { [field]: null, firstName: '', approved: true },
      ]) {
        expect(await failure(body)).toEqual({
          statusCode: 403,
          code: 'FIELD_NOT_EDITABLE',
          message: `${field} cannot be changed`,
        });
      }
    },
  );

  it.each(['approved', 'degrees', 'address', 'id', 'active'])(
    'unknown property %s → 400 VALIDATION_FAILED',
    async (field) => {
      expect(await failure({ firstName: 'Jana', [field]: 'x' })).toEqual({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: `property ${field} should not exist`,
      });
    },
  );

  it('blank names → 400 naming the field', async () => {
    expect(await failure({ firstName: '   ' })).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'firstName must not be empty',
    });
    expect((await failure({ surname: '' })).message).toBe(
      'surname must not be empty',
    );
  });

  it('more than 100 characters (after trim) → 400', async () => {
    expect((await failure({ surname: 'x'.repeat(101) })).message).toBe(
      'surname must be at most 100 characters',
    );
    await expect(
      pipe.transform({ surname: ` ${'x'.repeat(100)} ` }),
    ).resolves.toMatchObject({ surname: 'x'.repeat(100) });
  });

  it.each([null, 5, true, ['Jana']])(
    'non-string firstName %j → 400 naming the field',
    async (value) => {
      const body = await failure({ firstName: value });
      expect(body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
      });
      expect(body.message).toMatch(/^firstName /);
    },
  );

  it.each([{}, { firstName: undefined }])(
    'empty body %j → 400 (at least one field)',
    async (value) => {
      expect(await failure(value)).toEqual({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'At least one field is required',
      });
    },
  );

  it.each([null, 'Jana', [{ firstName: 'Jana' }]])(
    'non-object body %j → 400',
    async (value) => {
      expect(await failure(value)).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
      });
    },
  );
});
