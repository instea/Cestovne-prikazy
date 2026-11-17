import 'reflect-metadata';
import type { ApiErrorBody } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import { AdminUpdateUserDto, UpdateOwnProfileDto } from './user-edit.dto';
import { UserEditBodyPipe } from './user-edit-body.pipe';

const pipe = new UserEditBodyPipe(UpdateOwnProfileDto, ['email', 'isAdmin']);
const adminPipe = new UserEditBodyPipe(AdminUpdateUserDto, ['email']);

async function failure(
  value: unknown,
  using: UserEditBodyPipe<object> = pipe,
): Promise<ApiErrorBody> {
  try {
    await using.transform(value);
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

  it.each([
    ['__proto__', '{"__proto__":{"isAdmin":true},"surname":"X"}'],
    ['constructor', '{"constructor":"x","surname":"X"}'],
    ['prototype', '{"prototype":{},"surname":"X"}'],
  ])('a JSON %s key → 400 VALIDATION_FAILED', async (key, json) => {
    expect(await failure(JSON.parse(json))).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: `property ${key} should not exist`,
    });
  });

  it('FIELD_NOT_EDITABLE still wins over a __proto__ key', async () => {
    expect(
      await failure(JSON.parse('{"__proto__":{},"email":"x@instea.co"}')),
    ).toMatchObject({ statusCode: 403, code: 'FIELD_NOT_EDITABLE' });
  });

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

describe('UserEditBodyPipe (USR-02 admin body)', () => {
  it('accepts names and the admin flag, each alone', async () => {
    await expect(
      adminPipe.transform({
        firstName: ' Eva ',
        surname: 'Malá',
        isAdmin: true,
      }),
    ).resolves.toMatchObject({
      firstName: 'Eva',
      surname: 'Malá',
      isAdmin: true,
    });
    const onlyFlag = await adminPipe.transform({ isAdmin: false });
    expect(onlyFlag).toMatchObject({ isAdmin: false });
    expect(onlyFlag.firstName).toBeUndefined();
  });

  it('email → 403 FIELD_NOT_EDITABLE, even next to other problems', async () => {
    for (const body of [
      { email: 'x@instea.co' },
      { email: 'x@instea.co', isAdmin: 'yes', approved: true },
    ]) {
      expect(await failure(body, adminPipe)).toEqual({
        statusCode: 403,
        code: 'FIELD_NOT_EDITABLE',
        message: 'email cannot be changed',
      });
    }
  });

  it.each([null, 'true', 1, 0])(
    'non-boolean isAdmin %j → 400 naming the field',
    async (value) => {
      expect(await failure({ isAdmin: value }, adminPipe)).toEqual({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'isAdmin must be a boolean',
      });
    },
  );

  it.each(['approved', 'degrees', 'address', 'id', 'active'])(
    'unknown property %s → 400 VALIDATION_FAILED',
    async (field) => {
      expect(await failure({ [field]: 'x' }, adminPipe)).toEqual({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: `property ${field} should not exist`,
      });
    },
  );

  it('blank name and empty body → 400', async () => {
    expect((await failure({ firstName: '   ' }, adminPipe)).message).toBe(
      'firstName must not be empty',
    );
    expect((await failure({}, adminPipe)).message).toBe(
      'At least one field is required',
    );
  });
});
