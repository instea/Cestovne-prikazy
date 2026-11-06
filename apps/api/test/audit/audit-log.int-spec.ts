import { randomUUID } from 'node:crypto';
import { Controller, Inject, Module, Post } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import mongoose, { type Connection, type Model } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { AuditService } from '../../src/audit/audit.service';
import { AuditModule } from '../../src/audit/audit.module';
import { Public } from '../../src/auth/public.decorator';
import { withTransaction } from '../../src/database/transaction';
import { UsersModule } from '../../src/users/users.module';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';

/**
 * NFR-06 write path. Per-action tests (LEAVE_*, USER_*) come with the tasks
 * that own the writing endpoints (LV-01, LV-03, APR-01, AUTH-01, AUTH-04,
 * USR-02/03/04, NFR-07/08); here a probe stands in for a domain write.
 */
@Controller('test-probe')
class ProbeController {
  constructor(
    @Inject(getConnectionToken()) private readonly connection: Connection,
    @Inject(getModelToken(User.name)) private readonly users: Model<User>,
    private readonly audit: AuditService,
  ) {}

  /** Inserts a user + USER_REGISTERED in one transaction. */
  @Public()
  @Post()
  async create(): Promise<{ id: string }> {
    const id = `probe-${randomUUID()}`;
    await withTransaction(this.connection, async (session) => {
      await this.users.create([{ id, email: `${id}@instea.co` }], {
        session,
      });
      await this.audit.record(session, {
        actorType: 'user',
        actorId: id,
        action: 'USER_REGISTERED',
        targetType: 'USER',
        targetId: id,
        details: null,
      });
    });
    return { id };
  }
}

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [ProbeController],
})
class ProbeModule {}

const ctx = useTestApp({ imports: [ProbeModule] });

const entries = () =>
  ctx().app.get<Model<AuditLog>>(getModelToken(AuditLog.name));
const users = () => ctx().app.get<Model<User>>(getModelToken(User.name));
const connection = () => ctx().app.get<Connection>(getConnectionToken());

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuditService.record in a transaction', () => {
  it('commits the domain write and the entry together', async () => {
    ctx().clock.set('2026-11-04T09:15:02.123Z');
    const res = await ctx().request().post('/test-probe');
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    expect(await users().exists({ id })).toBeTruthy();
    const entry = await entries().findOne({ targetId: id }).lean();
    expect(entry).toMatchObject({
      actorType: 'user',
      actorId: id,
      action: 'USER_REGISTERED',
      targetType: 'USER',
      details: null,
      at: new Date('2026-11-04T09:15:02.123Z'),
    });
    expect(entry?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('audit insert failure → 500 INTERNAL_ERROR and no domain change', async () => {
    const before = await users().countDocuments();
    vi.spyOn(entries(), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    const res = await ctx().request().post('/test-probe');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    expect(await users().countDocuments()).toBe(before);
  });

  it('an invalid entry aborts the transaction', async () => {
    const id = `rollback-${randomUUID()}`;
    await expect(
      withTransaction(connection(), async (session) => {
        await users().create([{ id, email: `${id}@instea.co` }], { session });
        await ctx()
          .app.get(AuditService)
          .record(session, {
            actorType: 'user',
            // actorId missing for a user actor → validation error
            actorId: null as unknown as string,
            action: 'USER_REGISTERED',
            targetType: 'USER',
            targetId: id,
            details: null,
          });
      }),
    ).rejects.toThrow(/actorId/);
    expect(await users().exists({ id })).toBeNull();
  });

  it('a transient-error retry re-applies a document save (no entry without its change)', async () => {
    const id = `retry-${randomUUID()}`;
    await users().create({ id, email: `${id}@instea.co`, surname: 'Old' });
    const doc = (await users().findOne({ id }))!;
    let attempt = 0;
    await withTransaction(connection(), async (session) => {
      attempt += 1;
      doc.surname = 'New';
      await doc.save({ session });
      await ctx()
        .app.get(AuditService)
        .record(session, {
          actorType: 'cli',
          actorId: null,
          action: 'USER_UPDATED',
          targetType: 'USER',
          targetId: id,
          details: { before: { surname: 'Old' }, after: { surname: 'New' } },
        });
      if (attempt === 1) {
        const err = new mongoose.mongo.MongoServerError({
          message: 'forced transient error',
        });
        err.addErrorLabel('TransientTransactionError');
        throw err;
      }
    });
    expect(attempt).toBe(2);
    expect((await users().findOne({ id }).lean())?.surname).toBe('New');
    expect(await entries().countDocuments({ targetId: id })).toBe(1);
  });

  it('several entries of one call share the same at', async () => {
    ctx().clock.set('2026-11-04T10:00:00.000Z');
    const targetId = `multi-${randomUUID()}`;
    await withTransaction(connection(), (session) =>
      ctx()
        .app.get(AuditService)
        .record(session, [
          {
            actorType: 'cli',
            actorId: null,
            action: 'USER_UPDATED',
            targetType: 'USER',
            targetId,
            details: { before: { surname: 'A' }, after: { surname: 'B' } },
          },
          {
            actorType: 'cli',
            actorId: null,
            action: 'USER_ROLE_CHANGED',
            targetType: 'USER',
            targetId,
            details: { before: { isAdmin: false }, after: { isAdmin: true } },
          },
        ]),
    );
    const written = await entries().find({ targetId }).lean();
    expect(written).toHaveLength(2);
    expect(new Set(written.map((e) => e.at.toISOString()))).toEqual(
      new Set(['2026-11-04T10:00:00.000Z']),
    );
  });
});

describe('AuditLog is append-only', () => {
  const seedEntry = async () =>
    (
      await entries().create({
        at: new Date(),
        actorType: 'cli',
        actorId: null,
        action: 'USER_ROLE_CHANGED',
        targetType: 'USER',
        targetId: 'u1',
        details: null,
      })
    ).toObject();

  it.each([
    ['updateOne', (m: Model<AuditLog>) => m.updateOne({}, { targetId: 'x' })],
    ['updateMany', (m: Model<AuditLog>) => m.updateMany({}, { targetId: 'x' })],
    [
      'findOneAndUpdate',
      (m: Model<AuditLog>) => m.findOneAndUpdate({}, { targetId: 'x' }),
    ],
    ['replaceOne', (m: Model<AuditLog>) => m.replaceOne({}, {})],
    ['deleteOne', (m: Model<AuditLog>) => m.deleteOne({})],
    ['deleteMany', (m: Model<AuditLog>) => m.deleteMany({})],
    ['findOneAndDelete', (m: Model<AuditLog>) => m.findOneAndDelete({})],
  ])('%s throws', async (_name, op) => {
    await seedEntry();
    const count = await entries().countDocuments();
    await expect(op(entries())).rejects.toThrow(/append-only/);
    expect(await entries().countDocuments()).toBe(count);
  });

  it('document save / deleteOne of a loaded entry throws', async () => {
    const { id } = await seedEntry();
    const doc = await entries().findOne({ id });
    // Every path is also immutable, so a changed field fails validation
    // first; the save hook catches any re-save of a loaded entry.
    await expect(doc!.save()).rejects.toThrow(/append-only/);
    doc!.set('details', { x: 1 });
    await expect(doc!.save()).rejects.toThrow(/immutable/);
    await expect(doc!.deleteOne()).rejects.toThrow(/append-only/);
  });
});
