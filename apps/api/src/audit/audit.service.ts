import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  AuditAction,
  AuditActorType,
  AuditEntryDto,
  AuditPageDto,
  AuditTargetType,
} from '@leaves/shared/audit';
import type { ClientSession, Model } from 'mongoose';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { toUserRefDto } from '../users/user.mapper';
import { User } from '../users/user.schema';
import { scrubPersonalDetails } from './audit-details';
import { AuditLog } from './audit-log.schema';
import { auditFilter, type AuditQuery } from './audit-query';

/** Who acted: a user (`actorId` = User.id) or the CLI (`actorId` null). */
export type AuditActor =
  | { actorType: Extract<AuditActorType, 'user'>; actorId: string }
  | { actorType: Extract<AuditActorType, 'cli'>; actorId: null };

export type AuditEntryInput = AuditActor & {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: Record<string, unknown> | null;
};

/**
 * NFR-06 audit log. `record` runs inside the caller's transaction
 * (`withTransaction`), so the domain change and its entry commit together.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly entries: Model<AuditLog>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Inserts one or more entries in `session`. Several entries of one request
   * (e.g. USER_UPDATED + USER_ROLE_CHANGED) share the same `at`.
   */
  async record(
    session: ClientSession,
    entry: AuditEntryInput | readonly AuditEntryInput[],
  ): Promise<void> {
    const list: readonly AuditEntryInput[] = Array.isArray(entry)
      ? (entry as readonly AuditEntryInput[])
      : [entry as AuditEntryInput];
    if (list.length === 0) return;
    const at = this.clock.now();
    // `create` with an array + session; ordered so a failure aborts cleanly.
    await this.entries.create(
      list.map((e) => ({ ...e, at })),
      { session, ordered: true },
    );
  }

  /**
   * NFR-08: the single permitted mutation of the log. In every entry with
   * `targetType=USER` and `targetId=userId`, `email` / `firstName` /
   * `surname` in `details.before` / `details.after` become `"[anonymized]"`
   * (`scrubPersonalDetails`); `id`, `at`, `action`, `actorId` and all other
   * details stay. Runs in the caller's transaction. Uses the raw driver
   * collection on purpose: the model's append-only hooks reject every
   * Mongoose update. Returns the number of entries changed.
   */
  async scrubUserPersonalData(
    session: ClientSession,
    userId: string,
  ): Promise<number> {
    const docs = await this.entries
      .find({ targetType: 'USER', targetId: userId }, { _id: 1, details: 1 })
      .session(session)
      .lean();
    const updates = docs.flatMap((doc) => {
      const details = doc.details ?? null;
      const scrubbed = scrubPersonalDetails(details);
      return scrubbed === details
        ? []
        : [
            {
              updateOne: {
                filter: { _id: doc._id },
                update: { $set: { details: scrubbed } },
              },
            },
          ];
    });
    if (updates.length === 0) return 0;
    await this.entries.collection.bulkWrite(updates, {
      session,
      ordered: true,
    });
    return updates.length;
  }

  /** `GET /api/admin/audit`: sorted `at` desc, `id` desc; `total` before paging. */
  async list(query: AuditQuery): Promise<AuditPageDto> {
    const filter = auditFilter(query, this.config.DEFAULT_TIMEZONE);
    const [total, docs] = await Promise.all([
      this.entries.countDocuments(filter),
      this.entries
        .find(filter)
        .sort({ at: -1, id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
    ]);

    const actorIds = [
      ...new Set(
        docs.flatMap((d) =>
          d.actorType === 'user' && d.actorId ? [d.actorId] : [],
        ),
      ),
    ];
    const actors = new Map(
      (actorIds.length === 0
        ? []
        : await this.users
            .find(
              { id: { $in: actorIds } },
              { id: 1, firstName: 1, surname: 1, active: 1, anonymizedAt: 1 },
            )
            .lean()
      ).map((u) => [u.id, toUserRefDto(u)]),
    );

    const items: AuditEntryDto[] = docs.map((d) => ({
      id: d.id,
      at: d.at.toISOString(),
      actorType: d.actorType,
      actorId: d.actorId ?? null,
      actor:
        d.actorType === 'user' && d.actorId
          ? (actors.get(d.actorId) ?? null)
          : null,
      action: d.action,
      targetType: d.targetType,
      targetId: d.targetId,
      details: d.details ?? null,
    }));
    return { items, page: query.page, pageSize: query.pageSize, total };
  }
}
