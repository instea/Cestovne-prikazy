import type { UserDto } from '@leaves/shared/dto';

/** Query key of `GET /api/users` (USR-01; also read by the audit page). */
export const USERS_KEY = ['users'] as const;

/** Query key of `GET /api/auth/me` (USR-03 profile). */
export const ME_KEY = ['auth', 'me'] as const;

/** Query key of `GET /api/users/:id` (USR-02 edit form). */
export const userKey = (id: string) => ['users', id] as const;

/** `First Surname` (USR-04 confirmation), trimmed; '' when both are empty. */
export function fullName(user: Pick<UserDto, 'firstName' | 'surname'>): string {
  return `${user.firstName.trim()} ${user.surname.trim()}`.trim();
}

/** USR-01 "Name" column: `surname, firstName`, without the comma when one is empty. */
export function listName(user: Pick<UserDto, 'firstName' | 'surname'>): string {
  return [user.surname.trim(), user.firstName.trim()]
    .filter((part) => part !== '')
    .join(', ');
}

/** NFR-08: the typed text confirms when, trimmed and lowercased, it is the email. */
export const anonymizeConfirmed = (typed: string, email: string): boolean =>
  typed.trim().toLowerCase() === email;
