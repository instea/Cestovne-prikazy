import type { UserRefDto } from './dto.js';

/** Number of calendar colours; `colorForUser` returns `0 … USER_COLOR_COUNT-1`. */
export const USER_COLOR_COUNT = 15;

export interface FormatUserNameOptions {
  /** Id of the referenced user, used when the user is missing. */
  id?: string;
  deactivatedSuffix?: string;
  deletedPrefix?: string;
}

/**
 * Display name (DATA-01): `First Surname`, `First Surname (deactivated)`, or
 * `Deleted <id>` for a reference to a missing user (defensive fallback).
 */
export function formatUserName(
  user: Pick<UserRefDto, 'firstName' | 'surname' | 'active'> | null | undefined,
  options: FormatUserNameOptions = {},
): string {
  const {
    id = '',
    deactivatedSuffix = '(deactivated)',
    deletedPrefix = 'Deleted',
  } = options;
  if (!user) return `${deletedPrefix} ${id}`.trim();
  const name = `${user.firstName.trim()} ${user.surname.trim()}`.trim();
  return user.active ? name : `${name} ${deactivatedSuffix}`;
}

/**
 * LST-01: the `UserRefDto` the API returns for a referenced user id with no
 * user document (should not happen after MIG-01). Displayed `Deleted <id>`
 * by `formatUserRef`.
 */
export function missingUserRef(id: string): UserRefDto {
  return {
    id,
    firstName: 'Deleted',
    surname: id,
    active: false,
    anonymized: false,
  };
}

/** `true` for the `missingUserRef` placeholder. */
export function isMissingUserRef(ref: UserRefDto): boolean {
  return (
    ref.firstName === 'Deleted' &&
    ref.surname === ref.id &&
    !ref.active &&
    !ref.anonymized
  );
}

/**
 * Display name of a `UserRefDto` embedded in a leave: `formatUserName`, but
 * the `missingUserRef` placeholder (and `null`) renders as `Deleted <id>`
 * instead of `Deleted <id> (deactivated)`.
 */
export function formatUserRef(
  ref: UserRefDto | null,
  options: FormatUserNameOptions = {},
): string {
  if (!ref) return formatUserName(null, options);
  if (isMissingUserRef(ref))
    return formatUserName(null, { ...options, id: ref.id });
  return formatUserName(ref, options);
}

/** Calendar colour index: FNV-1a 32-bit hash of the UTF-8 `id`, mod 15. */
export function colorForUser(id: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8Bytes(id)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % USER_COLOR_COUNT;
}

/** USR-02 / USR-03: maximum length of `firstName` / `surname` (DATA-01). */
export const USER_NAME_MAX_LENGTH = 100;

/** Why a first name / surname is invalid: blank after trim, or too long. */
export type UserNameError = 'required' | 'maxLength';

/**
 * USR-02 / USR-03 name rule, shared by the API DTOs and the web forms: the
 * trimmed value must have 1–`USER_NAME_MAX_LENGTH` characters.
 */
export function userNameError(value: string): UserNameError | null {
  const trimmed = value.trim();
  if (trimmed === '') return 'required';
  if (trimmed.length > USER_NAME_MAX_LENGTH) return 'maxLength';
  return null;
}

/** UTF-8 bytes of `s` (no TextEncoder: shared code has no DOM/Node types). */
function* utf8Bytes(s: string): Generator<number> {
  for (const char of s) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) {
      yield cp;
    } else if (cp < 0x800) {
      yield 0xc0 | (cp >> 6);
      yield 0x80 | (cp & 0x3f);
    } else if (cp < 0x10000) {
      yield 0xe0 | (cp >> 12);
      yield 0x80 | ((cp >> 6) & 0x3f);
      yield 0x80 | (cp & 0x3f);
    } else {
      yield 0xf0 | (cp >> 18);
      yield 0x80 | ((cp >> 12) & 0x3f);
      yield 0x80 | ((cp >> 6) & 0x3f);
      yield 0x80 | (cp & 0x3f);
    }
  }
}
