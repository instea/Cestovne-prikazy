import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditActorType,
  type AuditTargetType,
} from '@leaves/shared/audit';
import { type HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export const AUDIT_LOG_COLLECTION = 'auditlogs';

/**
 * NFR-06 AuditLog (collection `auditlogs`). Append-only: the hooks below
 * reject every update / delete through Mongoose. Entries are kept forever
 * (no retention, interview: Retention).
 * The single permitted mutation is the NFR-08 personal-data scrub
 * (`AuditService.scrubUserPersonalData`), which bypasses these hooks on a
 * dedicated path (raw driver `collection.bulkWrite`).
 */
@Schema({
  collection: AUDIT_LOG_COLLECTION,
  strict: 'throw',
  versionKey: false,
})
export class AuditLog {
  @Prop({
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: () => randomUUID(),
  })
  id!: string;

  /** Server clock at write (UTC). */
  @Prop({ type: Date, required: true, immutable: true })
  at!: Date;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: AUDIT_ACTOR_TYPES,
  })
  actorType!: AuditActorType;

  /** `User.id`; non-null for `user`, null for `cli` (validated below). */
  @Prop({ type: String, default: null, immutable: true })
  actorId!: string | null;

  @Prop({ type: String, required: true, immutable: true, enum: AUDIT_ACTIONS })
  action!: AuditAction;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: AUDIT_TARGET_TYPES,
  })
  targetType!: AuditTargetType;

  /** `Leave.id` or `User.id`. */
  @Prop({ type: String, required: true, immutable: true })
  targetId!: string;

  /** Shape per action (`audit-details.ts`); ids only, no names. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null, immutable: true })
  details!: Record<string, unknown> | null;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ at: -1, id: -1 });
AuditLogSchema.index({ actorId: 1, at: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, at: -1 });
AuditLogSchema.index({ action: 1, at: -1 });

AuditLogSchema.pre('validate', function () {
  if ((this.actorType === 'user') !== (this.actorId != null)) {
    this.invalidate(
      'actorId',
      this.actorType === 'user'
        ? 'actorId is required for actorType user'
        : 'actorId must be null for actorType cli',
    );
  }
});

export class AuditLogAppendOnlyError extends Error {
  constructor(operation: string) {
    super(`AuditLog is append-only: ${operation} is not allowed`);
    this.name = 'AuditLogAppendOnlyError';
  }
}

const QUERY_MUTATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

for (const op of QUERY_MUTATIONS) {
  AuditLogSchema.pre(op, { query: true, document: false }, function () {
    throw new AuditLogAppendOnlyError(op);
  });
}
for (const op of ['updateOne', 'deleteOne'] as const) {
  AuditLogSchema.pre(op, { document: true, query: false }, function () {
    throw new AuditLogAppendOnlyError(op);
  });
}
// `doc.save()` on a loaded entry would be an update.
AuditLogSchema.pre('save', function () {
  if (!this.isNew) throw new AuditLogAppendOnlyError('save');
});
