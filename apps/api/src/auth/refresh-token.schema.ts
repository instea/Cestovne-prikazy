import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const RevokedReason = {
  ROTATED: 'ROTATED',
  LOGOUT: 'LOGOUT',
  DEACTIVATED: 'DEACTIVATED',
  REUSE_DETECTED: 'REUSE_DETECTED',
} as const;

export type RevokedReason = (typeof RevokedReason)[keyof typeof RevokedReason];

/**
 * AUTH-02 RefreshToken (collection `refresh_tokens`). Only the SHA-256 of
 * the raw token is stored. Technical session records: the TTL index drops
 * them after `expiresAt` (not business data, no retention rule applies).
 */
@Schema({
  // TODO(MIG-01): `--replace` must clear this collection. Use this name (or
  // the model's `collection.name`), not `refreshtokens` as the MIG-01 spec
  // text says; that collection does not exist.
  collection: 'refresh_tokens',
  timestamps: { createdAt: true, updatedAt: false },
  strict: 'throw',
})
export class RefreshToken {
  @Prop({
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: () => randomUUID(),
  })
  id!: string;

  /** `User.id` (DATA-01). */
  @Prop({ type: String, required: true, index: true, immutable: true })
  userId!: string;

  /** New per login; every rotation stays in the family. */
  @Prop({ type: String, required: true, index: true, immutable: true })
  familyId!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    immutable: true,
    match: /^[0-9a-f]{64}$/,
  })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({
    type: String,
    default: null,
    enum: [...Object.values(RevokedReason), null],
  })
  revokedReason!: RevokedReason | null;

  /** `id` of the successor after rotation. */
  @Prop({ type: String, default: null })
  replacedById!: string | null;

  createdAt!: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// TTL: MongoDB removes a token once `expiresAt` has passed.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
