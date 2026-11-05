import type { Model } from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User, UserSchema } from '../../src/users/user.schema';
import { useTestDatabase } from '../support/mongo';

const db = useTestDatabase();
let Users: Model<User>;

const valid = (n = 1): Partial<User> => ({
  id: `g-${n}`,
  email: `user${n}@instea.co`,
  firstName: 'Jana',
  surname: 'Novák',
});

beforeAll(async () => {
  Users = db.connection().model(User.name, UserSchema);
  await Users.init(); // builds unique indexes before the tests rely on them
});

beforeEach(async () => {
  await Users.deleteMany({});
});

describe('User model (DATA-01)', () => {
  it('applies defaults and timestamps', async () => {
    const u = await Users.create({ id: 'g-1', email: 'u@instea.co' });
    expect(u).toMatchObject({
      firstName: '',
      surname: '',
      isAdmin: false,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
    });
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.updatedAt).toBeInstanceOf(Date);
  });

  it.each(['id', 'email'] as const)('requires %s', async (field) => {
    const doc = valid();
    delete doc[field];
    await expect(Users.create(doc)).rejects.toThrow(/validation failed/i);
  });

  it('rejects an invalid email', async () => {
    await expect(
      Users.create({ ...valid(), email: 'not-an-email' }),
    ).rejects.toThrow(/email must be a valid email/);
  });

  it('normalises email to lowercase and trims names', async () => {
    const u = await Users.create({
      ...valid(),
      email: '  Jana.Novak@Instea.CO ',
      firstName: '  Jana ',
    });
    expect(u.email).toBe('jana.novak@instea.co');
    expect(u.firstName).toBe('Jana');
  });

  it('rejects a second email that differs only in case', async () => {
    await Users.create({ ...valid(1), email: 'same@instea.co' });
    await expect(
      Users.create({ ...valid(2), email: 'SAME@instea.co' }),
    ).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('rejects a duplicate id', async () => {
    await Users.create(valid(1));
    await expect(
      Users.create({ ...valid(2), id: 'g-1' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects names longer than 100 characters', async () => {
    await expect(
      Users.create({ ...valid(), surname: 'x'.repeat(101) }),
    ).rejects.toThrow(/validation failed/i);
  });

  it.each(['degrees', 'address', 'approved'])(
    'rejects unknown field %s on insert',
    async (f) => {
      await expect(Users.create({ ...valid(), [f]: 'x' })).rejects.toThrow(
        /not in schema/,
      );
    },
  );

  it.each(['degrees', 'address', 'approved'])(
    'rejects unknown field %s on update',
    async (f) => {
      await Users.create(valid());
      await expect(
        Users.updateOne({ id: 'g-1' }, { $set: { [f]: true } }),
      ).rejects.toThrow(/not in schema/);
    },
  );

  it('rejects changing the immutable id', async () => {
    const u = await Users.create(valid());
    u.id = 'other';
    await expect(u.save()).rejects.toThrow(/Path `id` is immutable/);
    expect((await Users.findOne({ email: 'user1@instea.co' }))?.id).toBe('g-1');
  });

  it('enforces active=false ⇔ deactivatedAt != null', async () => {
    await expect(Users.create({ ...valid(1), active: false })).rejects.toThrow(
      /deactivatedAt is required for a deactivated user/,
    );
    await expect(
      Users.create({ ...valid(2), deactivatedAt: new Date() }),
    ).rejects.toThrow(/deactivatedAt must be null for an active user/);
    const ok = await Users.create({
      ...valid(3),
      active: false,
      deactivatedAt: new Date(),
    });
    expect(ok.active).toBe(false);
  });

  it('has unique indexes on id and email', async () => {
    const indexes = (await Users.listIndexes()) as Array<{
      key: Record<string, number>;
      unique?: boolean;
    }>;
    const byKey = (key: string) =>
      indexes.find(
        (i) => JSON.stringify(i.key) === JSON.stringify({ [key]: 1 }),
      );
    expect(byKey('id')?.unique).toBe(true);
    expect(byKey('email')?.unique).toBe(true);
  });
});
