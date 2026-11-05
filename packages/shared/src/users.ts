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

/** Calendar colour index: FNV-1a 32-bit hash of the UTF-8 `id`, mod 15. */
export function colorForUser(id: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8Bytes(id)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % USER_COLOR_COUNT;
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
