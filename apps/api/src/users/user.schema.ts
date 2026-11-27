import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * DATA-01 User (collection `users`). `id` is the Google `sub`; Mongo `_id`
 * is internal. Users are never hard-deleted (soft delete via `active`).
 */
@Schema({ collection: 'users', timestamps: true, strict: 'throw' })
export class User {
  @Prop({ type: String, required: true, unique: true, immutable: true })
  id!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [EMAIL, 'email must be a valid email'],
  })
  email!: string;

  // `required` would reject '' (allowed when Google gave no name).
  @Prop({ type: String, default: '', trim: true, maxlength: 100 })
  firstName!: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 100 })
  surname!: string;

  @Prop({ type: Boolean, required: true, default: false })
  isAdmin!: boolean;

  @Prop({ type: Boolean, required: true, default: true })
  active!: boolean;

  @Prop({ type: Date, default: null })
  deactivatedAt!: Date | null;

  @Prop({ type: Date, default: null })
  anonymizedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Invariant: active=false ⇔ deactivatedAt != null.
UserSchema.pre('validate', function () {
  if (this.active === (this.deactivatedAt != null)) {
    this.invalidate(
      'deactivatedAt',
      this.active
        ? 'deactivatedAt must be null for an active user'
        : 'deactivatedAt is required for a deactivated user',
    );
  }
  for (const field of ['firstName', 'surname'] as const) {
    if (typeof this[field] !== 'string')
      this.invalidate(field, `${field} must be a string`);
  }
});
