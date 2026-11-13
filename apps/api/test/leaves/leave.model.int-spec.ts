import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import mongoose, { type Model } from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadLeaveDtos } from '../../src/leaves/leave.mapper';
import { Leave, LeaveSchema } from '../../src/leaves/leave.schema';
import { User, UserSchema } from '../../src/users/user.schema';
import { useTestDatabase } from '../support/mongo';

const db = useTestDatabase();
let Leaves: Model<Leave>;
let Users: Model<User>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const valid = (over: Partial<Leave> = {}): Partial<Leave> => ({
  requesterId: 'g-1',
  startDate: '2026-11-09',
  endDate: '2026-11-13',
  numDays: 5,
  ...over,
});

beforeAll(async () => {
  Leaves = db.connection().model(Leave.name, LeaveSchema);
  Users = db.connection().model(User.name, UserSchema);
  await Leaves.init(); // builds indexes before the tests rely on them
});

beforeEach(async () => {
  await Leaves.deleteMany({});
  await Users.deleteMany({});
});

describe('Leave model (DATA-02)', () => {
  it('uses the leaves collection', () => {
    expect(Leaves.collection.collectionName).toBe('leaves');
  });

  it('applies defaults: uuid v4 id, ANNUAL, PENDING, not half-day, no approver', async () => {
    const l = await Leaves.create(valid());
    expect(l.id).toMatch(UUID_V4);
    expect(l).toMatchObject({
      type: LeaveType.ANNUAL,
      state: LeaveState.PENDING,
      isHalfDay: false,
      approverId: null,
    });
    expect(l.createdAt).toBeInstanceOf(Date);
    expect(l.updatedAt).toBeInstanceOf(Date);
    const raw = await Leaves.collection.findOne({ id: l.id });
    expect(raw).toMatchObject({ approverId: null, type: 'ANNUAL' });
  });

  it.each(['requesterId', 'startDate', 'endDate', 'numDays'] as const)(
    'requires %s',
    async (field) => {
      const doc = valid();
      delete doc[field];
      await expect(Leaves.create(doc)).rejects.toThrow(/validation failed/i);
    },
  );

  it.each(['type', 'state', 'isHalfDay', 'id'] as const)(
    'rejects an explicit null %s',
    async (field) => {
      await expect(Leaves.create(valid({ [field]: null }))).rejects.toThrow(
        /validation failed/i,
      );
    },
  );

  it.each([
    ['state', 'DONE'],
    ['type', 'VACATION'],
  ] as const)('rejects %s = %s', async (field, value) => {
    await expect(Leaves.create(valid({ [field]: value }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  it('accepts every LeaveType and LeaveState', async () => {
    for (const type of Object.values(LeaveType))
      for (const state of Object.values(LeaveState))
        await expect(
          Leaves.create(valid({ type, state })),
        ).resolves.toBeTruthy();
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-1-09',
    '2026-11-09T00:00:00.000Z',
    '09.11.2026',
  ])('rejects startDate %s', async (startDate) => {
    await expect(
      Leaves.create(valid({ startDate, endDate: '2026-12-31' })),
    ).rejects.toThrow(/startDate must be a real YYYY-MM-DD date/);
  });

  it('rejects an invalid endDate', async () => {
    await expect(
      Leaves.create(valid({ endDate: '2026-11-31' })),
    ).rejects.toThrow(/endDate must be a real YYYY-MM-DD date/);
  });

  it('rejects endDate before startDate, accepts a single day', async () => {
    await expect(
      Leaves.create(valid({ startDate: '2026-11-10', endDate: '2026-11-09' })),
    ).rejects.toThrow(/Start date must not be greater than end date/);
    await expect(
      Leaves.create(
        valid({ startDate: '2026-11-09', endDate: '2026-11-09', numDays: 1 }),
      ),
    ).resolves.toBeTruthy();
  });

  it('allows isHalfDay only for a single day', async () => {
    await expect(Leaves.create(valid({ isHalfDay: true }))).rejects.toThrow(
      /Half day option is allowed only within single day/,
    );
    const ok = await Leaves.create(
      valid({
        startDate: '2026-11-09',
        endDate: '2026-11-09',
        isHalfDay: true,
        numDays: 0.5,
      }),
    );
    expect(ok.isHalfDay).toBe(true);
  });

  it('reports only END_BEFORE_START when both date rules fail', async () => {
    const doc = new Leaves(
      valid({
        startDate: '2026-11-10',
        endDate: '2026-11-09',
        isHalfDay: true,
      }),
    );
    const err = await doc.validate().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(Object.keys((err as mongoose.Error.ValidationError).errors)).toEqual(
      ['endDate'],
    );
  });

  it.each([
    ['isHalfDay', 'yes'],
    ['isHalfDay', 'true'],
    ['isHalfDay', 1],
    ['numDays', '1'],
    ['numDays', Number.NaN],
  ] as const)('rejects coerced %s = %s', async (field, value) => {
    await expect(
      Leaves.create(
        valid({
          startDate: '2026-11-09',
          endDate: '2026-11-09',
          numDays: 1,
          [field]: value,
        }),
      ),
    ).rejects.toThrow(/validation failed/i);
  });

  it('runs validators on query updates', async () => {
    const l = await Leaves.create(valid());
    await expect(
      Leaves.findOneAndUpdate({ id: l.id }, { $set: { state: 'DONE' } }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Leaves.updateOne({ id: l.id }, { $set: { endDate: '2026-02-30' } }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Leaves.updateOne({ id: l.id }, { $set: { numDays: -1 } }),
    ).rejects.toThrow(/validation failed/i);
    await expect(
      Leaves.updateMany({}, { $set: { type: 'VACATION' } }),
    ).rejects.toThrow(/validation failed/i);
    expect(await Leaves.findOne({ id: l.id }).lean()).toMatchObject({
      state: 'PENDING',
      endDate: '2026-11-13',
      numDays: 5,
      type: 'ANNUAL',
    });
    const before = await Leaves.findOneAndUpdate(
      { id: l.id },
      { $set: { state: LeaveState.APPROVED, approverId: 'g-2' } },
      { returnDocument: 'before' },
    );
    expect(before?.state).toBe('PENDING');
    expect(await Leaves.findOne({ id: l.id }).lean()).toMatchObject({
      state: 'APPROVED',
      approverId: 'g-2',
    });
  });

  it.each([-0.5, 1.25, 0.3])('rejects numDays %s', async (numDays) => {
    await expect(Leaves.create(valid({ numDays }))).rejects.toThrow(
      /numDays must be a non-negative multiple of 0.5/,
    );
  });

  it.each([0, 0.5, 2.5, 22])('accepts numDays %s', async (numDays) => {
    await expect(Leaves.create(valid({ numDays }))).resolves.toBeTruthy();
  });

  it('rejects a non-string approverId', async () => {
    await expect(
      Leaves.create(valid({ approverId: 42 } as unknown as Partial<Leave>)),
    ).rejects.toThrow(/validation failed/i);
  });

  it('rejects an unknown field', async () => {
    await expect(
      Leaves.create({ ...valid(), comment: 'x' } as Partial<Leave>),
    ).rejects.toThrow(/not in schema/);
  });

  it('rejects changing the immutable id', async () => {
    const original = '0b9d1f8e-3c2a-4e5b-9a7c-6d5e4f3a2b1c';
    const l = await Leaves.create(valid({ id: original }));
    l.id = 'other';
    await expect(l.save()).rejects.toThrow(/Path `id` is immutable/);
    expect(await Leaves.countDocuments({ id: original })).toBe(1);
  });

  it('rejects a second insert with the same id (duplicate key)', async () => {
    const id = '7a1c0c5e-9a51-4d3e-8f6b-1d2c3b4a5e6f';
    await Leaves.create(valid({ id }));
    await expect(Leaves.create(valid({ id }))).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('has the 4 spec indexes, id unique', async () => {
    const indexes = (await Leaves.collection.indexes()) as Array<{
      key: Record<string, number>;
      unique?: boolean;
    }>;
    const byKey = (key: Record<string, number>) =>
      indexes.find((i) => JSON.stringify(i.key) === JSON.stringify(key));
    expect(byKey({ id: 1 })?.unique).toBe(true);
    expect(byKey({ requesterId: 1, startDate: 1 })).toBeDefined();
    expect(byKey({ state: 1, startDate: 1 })).toBeDefined();
    expect(byKey({ startDate: 1, endDate: 1 })).toBeDefined();
    expect(indexes).toHaveLength(5); // + _id_
  });

  it('loadLeaveDtos drops _id / __v and resolves requester / approver', async () => {
    await Users.create([
      {
        id: 'g-1',
        email: 'jana@instea.co',
        firstName: 'Jana',
        surname: 'Nová',
      },
      {
        id: 'g-2',
        email: 'boss@instea.co',
        firstName: 'Boss',
        surname: 'Man',
        active: false,
        deactivatedAt: new Date(),
      },
    ]);
    await Leaves.create([
      valid({ approverId: 'g-2', state: LeaveState.APPROVED }),
      valid({
        requesterId: 'deleted-user',
        startDate: '2026-12-01',
        endDate: '2026-12-01',
        numDays: 1,
      }),
    ]);
    const leaves = await Leaves.find().sort({ startDate: 1 }).lean();
    const [first, second] = await loadLeaveDtos(leaves, Users);

    expect(first).not.toHaveProperty('_id');
    expect(first).not.toHaveProperty('__v');
    expect(first?.requester).toEqual({
      id: 'g-1',
      firstName: 'Jana',
      surname: 'Nová',
      active: true,
      anonymized: false,
    });
    expect(first?.approver).toEqual({
      id: 'g-2',
      firstName: 'Boss',
      surname: 'Man',
      active: false,
      anonymized: false,
    });
    expect(first?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(second).toMatchObject({
      requester: {
        id: 'deleted-user',
        firstName: 'Deleted',
        surname: 'deleted-user',
        active: false,
        anonymized: false,
      },
      approver: null,
    });
    expect(await loadLeaveDtos([], Users)).toEqual([]);
  });
});
