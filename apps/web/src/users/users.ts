import type { UserDto } from '@leaves/shared/dto';

/** Query key of `GET /api/users` (USR-01; also read by the audit page). */
export const USERS_KEY = ['users'] as const;

/** Query key of `GET /api/auth/me` (USR-03 profile). */
export const ME_KEY = ['auth', 'me'] as const;

/** USR-01 "Name" column: `surname, firstName`, without the comma when one is empty. */
export function listName(user: Pick<UserDto, 'firstName' | 'surname'>): string {
  return [user.surname.trim(), user.firstName.trim()]
    .filter((part) => part !== '')
    .join(', ');
}
