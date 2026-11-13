import type { UserDto, UserRefDto } from '@leaves/shared/dto';
import type { User } from './user.schema';

/** Fields read from a User document or lean object; `_id` / `__v` never leave. */
type UserLike = Pick<
  User,
  | 'id'
  | 'email'
  | 'firstName'
  | 'surname'
  | 'isAdmin'
  | 'active'
  | 'deactivatedAt'
  | 'anonymizedAt'
  | 'createdAt'
  | 'updatedAt'
>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toUserDto(u: UserLike): UserDto {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    surname: u.surname,
    isAdmin: u.isAdmin,
    active: u.active,
    deactivatedAt: iso(u.deactivatedAt),
    anonymizedAt: iso(u.anonymizedAt),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export function toUserRefDto(
  u: Pick<User, 'id' | 'firstName' | 'surname' | 'active' | 'anonymizedAt'>,
): UserRefDto {
  return {
    id: u.id,
    firstName: u.firstName,
    surname: u.surname,
    active: u.active,
    anonymized: u.anonymizedAt != null,
  };
}
