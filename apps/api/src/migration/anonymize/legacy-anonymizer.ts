import { mongo } from 'mongoose';
import { type LegacyDoc, migrateLegacy } from '../legacy-mapping';
import {
  type EmailCollision,
  isOpaqueValue,
  numericValue,
  Pseudonymizer,
} from './pseudonym';

/**
 * MIG-02 anonymization of the legacy `users` / `leaves` documents (pure, no
 * I/O; `anonymize-runner.ts` reads and writes). Every field that affects the
 * migration result stays unchanged: `_id`, leave `id`, dates, `state`,
 * `type`, `isHalfDay`, `numDays`, `approved`, `isAdmin`, `__v`, presence /
 * absence of every field, references between leaves and users, email domain
 * and letter-case pattern.
 */

/** Carried over unchanged. */
export const USER_KEPT_FIELDS = ['_id', 'isAdmin', 'approved', '__v'] as const;
/** Pseudonymized (personal data). */
export const USER_PII_FIELDS = [
  'id',
  'email',
  'firstName',
  'surname',
  'degrees',
  'address',
] as const;
export const LEAVE_KEPT_FIELDS = [
  '_id',
  'id',
  'startDate',
  'endDate',
  'state',
  'type',
  'isHalfDay',
  'numDays',
  '__v',
] as const;
/** References to `users.id`, mapped with the same function. */
export const LEAVE_REF_FIELDS = ['requesterId', 'approverId'] as const;

/** MIG-01 `firstName` / `surname` limit (User schema `maxlength`). */
const NAME_MAX = 100;

const has = (list: readonly string[], key: string) => list.includes(key);

/** `_id` as hex (sort tie-break, leak paths), else its JSON. */
export function idLabel(id: unknown): string {
  if (id && typeof (id as { toHexString?: unknown }).toHexString === 'function')
    return (id as { toHexString(): string }).toHexString();
  return JSON.stringify(id) ?? 'undefined';
}

/**
 * `First<n>` / `Last<n>`: kept blank (empty / whitespace-only / missing /
 * null) so MIG-01 `USER_EMPTY_NAME` survives; padded to the original length
 * when the original exceeds the schema limit (same validation error).
 */
function pseudoName(
  prefix: string,
  n: number,
  value: unknown,
  p: Pseudonymizer,
) {
  // Numbers faked (same type, so a "not a string" finding survives);
  // null / missing / booleans kept.
  if (typeof value !== 'string') return p.redactDeep(value);
  const trimmed = value.trim();
  if (trimmed === '') return value;
  const name = `${prefix}${n}`;
  return trimmed.length > NAME_MAX ? name.padEnd(trimmed.length, '-') : name;
}

/** `''` for a present non-empty value; missing / null / `''` unchanged. */
function blank(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value;
  return '';
}

export interface AnonymizedLegacy {
  users: LegacyDoc[];
  leaves: LegacyDoc[];
}

/**
 * Anonymize users and leaves (source order and field order kept).
 * `n` of `First<n>` / `Last<n>` is the 1-based rank of the user's
 * pseudonymized id (ties and missing ids: by `_id`), so it does not depend
 * on the source order.
 */
export function anonymizeLegacy(
  users: readonly LegacyDoc[],
  leaves: readonly LegacyDoc[],
  p: Pseudonymizer,
): AnonymizedLegacy {
  const pseudoIds = users.map((u) => p.userId(u.id));
  const sortKey = (i: number) => {
    const id = pseudoIds[i];
    return typeof id === 'string' ? id : '';
  };
  const order = users
    .map((_, i) => i)
    .sort(
      (a, b) =>
        sortKey(a).localeCompare(sortKey(b), 'en') ||
        idLabel(users[a]!._id).localeCompare(idLabel(users[b]!._id), 'en') ||
        a - b,
    );
  const rank = new Map(order.map((userIndex, r) => [userIndex, r + 1]));

  const outUsers = users.map((doc, i) => {
    const n = rank.get(i)!;
    const out: LegacyDoc = {};
    for (const [key, value] of Object.entries(doc)) {
      if (has(USER_KEPT_FIELDS, key)) out[key] = value;
      else if (key === 'id') out[key] = pseudoIds[i];
      else if (key === 'email') out[key] = p.email(value);
      else if (key === 'firstName') out[key] = pseudoName('First', n, value, p);
      else if (key === 'surname') out[key] = pseudoName('Last', n, value, p);
      else if (key === 'degrees' || key === 'address') out[key] = blank(value);
      else out[key] = p.redactDeep(value, `users.${key}`);
    }
    return out;
  });

  const outLeaves = leaves.map((doc) => {
    const out: LegacyDoc = {};
    for (const [key, value] of Object.entries(doc)) {
      if (has(LEAVE_KEPT_FIELDS, key)) out[key] = value;
      else if (has(LEAVE_REF_FIELDS, key)) out[key] = p.userId(value);
      else out[key] = p.redactDeep(value, `leaves.${key}`);
    }
    return out;
  });

  return { users: outUsers, leaves: outLeaves };
}

/** Every string inside `value` (BSON / dates skipped) with its path. */
export function* stringsIn(
  value: unknown,
  path: string,
): Generator<[string, string]> {
  if (typeof value === 'string') {
    yield [path, value];
    return;
  }
  if (isOpaqueValue(value) || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      yield* stringsIn(value[i], `${path}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    yield* stringsIn(v, `${path}.${k}`);
}

/** Every number inside `value` (JS and BSON numeric types) with its path. */
export function* numbersIn(
  value: unknown,
  path: string,
): Generator<[string, number]> {
  const n = numericValue(value);
  if (n !== undefined) {
    if (Number.isFinite(n)) yield [path, n];
    return;
  }
  if (isOpaqueValue(value) || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      yield* numbersIn(value[i], `${path}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    yield* numbersIn(v, `${path}.${k}`);
}

/** Original values to look for (`findLeaks`); numbers compare as numbers. */
export interface LeakSources {
  forbidden: string[];
  kept: string[];
  forbiddenNumbers: number[];
  keptNumbers: number[];
}

export const emptyLeakSources = (): LeakSources => ({
  forbidden: [],
  kept: [],
  forbiddenNumbers: [],
  keptNumbers: [],
});

/** Adds every string and number of `value` to the forbidden or kept lists. */
export function collectValues(
  sources: LeakSources,
  value: unknown,
  kind: 'forbidden' | 'kept',
): void {
  for (const [, s] of stringsIn(value, ''))
    (kind === 'forbidden' ? sources.forbidden : sources.kept).push(s);
  for (const [, n] of numbersIn(value, ''))
    (kind === 'forbidden'
      ? sources.forbiddenNumbers
      : sources.keptNumbers
    ).push(n);
}

/** Substring matching only for long, non-numeric values (no false alarms). */
const SUBSTRING_MIN = 6;

/**
 * Leak check: paths (never values) of output strings that equal, or contain,
 * one of `forbidden`, and of output numbers equal to one of
 * `numbers.forbidden`. Values that also occur in `kept` (carried-over
 * fields, e.g. a surname equal to a leave state, a numeric value equal to
 * a kept `numDays`) are not leaks.
 */
export function findLeaks(
  forbidden: Iterable<string>,
  kept: Iterable<string>,
  output: Iterable<[string, unknown]>,
  numbers: { forbidden: Iterable<number>; kept: Iterable<number> } = {
    forbidden: [],
    kept: [],
  },
): string[] {
  const keptNumbers = new Set(numbers.kept);
  const forbiddenNumbers = new Set(
    [...numbers.forbidden].filter((n) => !keptNumbers.has(n)),
  );
  const keptValues = [...kept];
  const keptSet = new Set(keptValues);
  const exact = new Set<string>();
  const contained: string[] = [];
  for (const raw of forbidden) {
    for (const f of new Set([raw, raw.trim()])) {
      if (f.trim() === '' || keptSet.has(f)) continue;
      exact.add(f);
      if (
        f.length >= SUBSTRING_MIN &&
        !/^\d+$/.test(f) &&
        !keptValues.some((k) => k.includes(f))
      )
        contained.push(f);
    }
  }
  const leaks: string[] = [];
  for (const [root, value] of output) {
    for (const [path, s] of stringsIn(value, root)) {
      if (
        exact.has(s) ||
        exact.has(s.trim()) ||
        contained.some((f) => s.includes(f))
      )
        leaks.push(path);
    }
    for (const [path, n] of numbersIn(value, root))
      if (forbiddenNumbers.has(n)) leaks.push(path);
  }
  return leaks;
}

/**
 * Original personal-data values of the legacy collections: PII fields,
 * references and every field outside the known lists (redacted, so any
 * surviving value is a leak); kept fields as `kept`.
 */
export function legacyPii(
  users: readonly LegacyDoc[],
  leaves: readonly LegacyDoc[],
): LeakSources {
  const sources = emptyLeakSources();
  for (const u of users) {
    for (const [field, value] of Object.entries(u)) {
      if (has(USER_KEPT_FIELDS, field)) {
        collectValues(sources, value, 'kept');
        continue;
      }
      collectValues(sources, value, 'forbidden');
      if (field === 'email')
        for (const [, s] of stringsIn(value, field)) {
          const email = s.trim();
          sources.forbidden.push(email.toLowerCase());
          // The domain is kept on purpose (MIG-02 rule).
          const at = email.indexOf('@');
          if (at >= 0) sources.kept.push(email.slice(at + 1));
        }
    }
  }
  for (const l of leaves)
    for (const [field, value] of Object.entries(l))
      collectValues(
        sources,
        value,
        has(LEAVE_KEPT_FIELDS, field) ? 'kept' : 'forbidden',
      );
  return sources;
}

/** Output paths that still carry an original PII value (`[]` = clean). */
export function legacyLeaks(
  source: { users: readonly LegacyDoc[]; leaves: readonly LegacyDoc[] },
  output: AnonymizedLegacy,
): string[] {
  const { forbidden, kept, forbiddenNumbers, keptNumbers } = legacyPii(
    source.users,
    source.leaves,
  );
  const label = (c: string, d: LegacyDoc) => `${c}[${idLabel(d._id)}]`;
  return findLeaks(
    forbidden,
    kept,
    [
      ...output.users.map((d): [string, unknown] => [label('users', d), d]),
      ...output.leaves.map((d): [string, unknown] => [label('leaves', d), d]),
    ],
    { forbidden: forbiddenNumbers, kept: keptNumbers },
  );
}

/**
 * Distinct source user emails that share one pseudonym (paths
 * `users[<_id>].email`, never values): the parity run is blind for them.
 */
export function legacyEmailCollisions(
  users: readonly LegacyDoc[],
  p: Pseudonymizer,
): EmailCollision[] {
  return p.emailCollisions(
    users
      .filter((u) => Object.hasOwn(u, 'email'))
      .map((u): [string, unknown] => [
        `users[${idLabel(u._id)}].email`,
        u.email,
      ]),
  );
}

/** BSON values read with `promoteValues: false` → plain JS numbers (MIG-01 input). */
function promote(doc: LegacyDoc): LegacyDoc {
  return mongo.BSON.deserialize(mongo.BSON.serialize(doc));
}

export interface FindingComparison {
  original: Record<string, number>;
  anonymized: Record<string, number>;
  /** Codes whose counts differ. */
  differences: { code: string; original: number; anonymized: number }[];
}

const countByCode = (findings: { code: string }[]) => {
  const out: Record<string, number> = {};
  for (const f of findings) out[f.code] = (out[f.code] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
};

/**
 * MIG-02 check: MIG-01 (pure mapping, no I/O) finds the same number of
 * findings per code on the anonymized data as on the original.
 */
export function compareMigrationFindings(
  source: { users: readonly LegacyDoc[]; leaves: readonly LegacyDoc[] },
  output: AnonymizedLegacy,
  timezone: string,
): FindingComparison {
  const opts = { timezone, runStartedAt: new Date('2000-01-01T00:00:00Z') };
  const run = (u: readonly LegacyDoc[], l: readonly LegacyDoc[]) =>
    countByCode(migrateLegacy(u.map(promote), l.map(promote), opts).findings);
  const original = run(source.users, source.leaves);
  const anonymized = run(output.users, output.leaves);
  const codes = [
    ...new Set([...Object.keys(original), ...Object.keys(anonymized)]),
  ];
  const differences = codes
    .filter((c) => (original[c] ?? 0) !== (anonymized[c] ?? 0))
    .sort()
    .map((code) => ({
      code,
      original: original[code] ?? 0,
      anonymized: anonymized[code] ?? 0,
    }));
  return { original, anonymized, differences };
}
