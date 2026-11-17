import { createHmac } from 'node:crypto';
import { mongo } from 'mongoose';

/**
 * MIG-02 pseudonyms: HMAC-SHA256 with the per-rehearsal `ANONYMIZE_SECRET`,
 * deterministic (same secret + value → same pseudonym) and consistent
 * across the dump (`users`, `leaves`) and the recorded SSO / Toggl
 * fixtures, so references, the SSO email ↔ user match and the parity
 * comparison keep working on anonymized data.
 */

/** `ANONYMIZE_SECRET` minimum length (e.g. `openssl rand -hex 32`). */
export const MIN_SECRET_LENGTH = 32;

/** A value of a type the anonymizer cannot treat without risking PII. */
export class UnsupportedValueError extends Error {}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);

/**
 * Scalar (non-container) values: numbers, booleans, null/undefined, `Date`,
 * and BSON values (`ObjectId`, `Double`, `Int32`, `Long`, …, read with
 * `promoteValues: false`). None of them can hold a name or an email, but a
 * number can hold other personal data (a phone number, a personal id):
 * `redactDeep` fakes numbers (`numericValue`) and keeps only the rest.
 */
export function isOpaqueValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const t = typeof v;
  if (t === 'number' || t === 'boolean' || t === 'bigint') return true;
  if (v instanceof Date) return true;
  return (
    t === 'object' &&
    typeof (v as { _bsontype?: unknown })._bsontype === 'string'
  );
}

/**
 * The value of a JS number / bigint or a BSON `Double` / `Int32` / `Long` /
 * `Decimal128`; `undefined` for anything else.
 */
export function numericValue(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v !== 'object' || v === null) return undefined;
  switch ((v as { _bsontype?: unknown })._bsontype) {
    case 'Double':
    case 'Int32':
      return (v as mongo.Double | mongo.Int32).valueOf();
    case 'Long':
      return (v as mongo.Long).toNumber();
    case 'Decimal128':
      return Number((v as mongo.Decimal128).toString());
    default:
      return undefined;
  }
}

/**
 * One pair of paths whose distinct source emails get the same pseudonym
 * (the case rule: e.g. `HANA@x` / `Hana@x`). Paths only, never values.
 */
export type EmailCollision = [string, string];

/** Runner warning for `emailCollisions` (paths only); `null` when none. */
export function emailCollisionWarning(
  collisions: readonly EmailCollision[],
): string | null {
  if (collisions.length === 0) return null;
  return [
    `WARNING: ${collisions.length} pair(s) of distinct source emails share one pseudonym (letter case only); the parity run is blind to exact-match email differences for these users:`,
    ...collisions.map(([a, b]) => `- ${a} / ${b}`),
  ].join('\n');
}

export class Pseudonymizer {
  private readonly secret: string;

  constructor(secret: string) {
    if (secret.length < MIN_SECRET_LENGTH)
      throw new UnsupportedValueError(
        `ANONYMIZE_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
      );
    this.secret = secret;
  }

  /** First `length` hex chars of HMAC-SHA256(secret, value). */
  hex(value: string, length: number): string {
    return createHmac('sha256', this.secret)
      .update(value, 'utf8')
      .digest('hex')
      .slice(0, length);
  }

  /**
   * Deterministic non-negative integer below 2^31 of a numeric value: fits
   * every numeric BSON type, so the same value gives the same fake whatever
   * its type (e.g. an `Int32` user id and a `Double` reference to it).
   */
  private number(domain: string, value: number): number {
    return (
      Number.parseInt(this.hex(`${domain}\0${String(value)}`, 12), 16) % 2 ** 31
    );
  }

  /**
   * A fake for a numeric value (`numericValue`), of the same JS / BSON
   * type; `NaN` / `±Infinity` (no information) kept. Anything else
   * unchanged.
   */
  fakeNumber(value: unknown, domain = 'number'): unknown {
    const n = numericValue(value);
    if (n === undefined || !Number.isFinite(n)) return value;
    const fake = this.number(domain, n);
    if (typeof value === 'number') return fake;
    if (typeof value === 'bigint') return BigInt(fake);
    switch ((value as { _bsontype: string })._bsontype) {
      case 'Double':
        return new mongo.Double(fake);
      case 'Int32':
        return new mongo.Int32(fake);
      case 'Long':
        return mongo.Long.fromNumber(fake);
      default:
        return mongo.Decimal128.fromString(String(fake));
    }
  }

  /**
   * Paths of distinct source emails that map to the same `email`
   * pseudonym (one pair per two distinct values; exact duplicates are not
   * a collision, they collide in the source too). A non-empty result means
   * the rehearsal parity run cannot see an exact-match difference between
   * those emails (the old app compares emails case-sensitively).
   */
  emailCollisions(
    entries: Iterable<[path: string, email: unknown]>,
  ): EmailCollision[] {
    const byPseudonym = new Map<string, Map<string, string>>();
    for (const [path, email] of entries) {
      if (typeof email !== 'string' || email.trim() === '') continue;
      const pseudo = this.email(email) as string;
      const sources = byPseudonym.get(pseudo) ?? new Map<string, string>();
      if (!sources.has(email)) sources.set(email, path);
      byPseudonym.set(pseudo, sources);
    }
    const out: EmailCollision[] = [];
    for (const sources of byPseudonym.values()) {
      const paths = [...sources.values()];
      for (let i = 0; i < paths.length; i++)
        for (let j = i + 1; j < paths.length; j++)
          out.push([paths[i]!, paths[j]!]);
    }
    return out;
  }

  /**
   * User id (`users.id`, `leaves.requesterId` / `approverId`):
   * `anon-` + first 16 hex of HMAC(secret, id). Empty / blank strings and
   * missing values stay as they are (MIG-01 reports them the same way); a
   * number becomes another number of the same type (keeps the "not a
   * string" finding and the references between numeric ids).
   */
  userId(id: unknown): unknown {
    if (typeof id === 'string')
      return id.trim() === '' ? id : `anon-${this.hex(id, 16)}`;
    return this.scalar(id, 'id');
  }

  /**
   * Email: local part → `user-` + first 12 hex of HMAC(secret, trimmed
   * lowercased email); first letter uppercased when the original local part
   * has an uppercase letter; domain and surrounding whitespace kept. So
   * `A@x` / `a@x` stay distinct but collide when lowercased (MIG-01
   * `USER_DUPLICATE_EMAIL` survives), and validity is kept: an empty local
   * part stays empty, one with whitespace keeps a space, no `@` stays none.
   */
  email(value: unknown): unknown {
    if (typeof value !== 'string') return this.scalar(value, 'email');
    const trimmed = value.trim();
    if (trimmed === '') return value;
    const lead = value.slice(0, value.indexOf(trimmed));
    const trail = value.slice(lead.length + trimmed.length);
    const at = trimmed.indexOf('@');
    const local = at < 0 ? trimmed : trimmed.slice(0, at);
    const domain = at < 0 ? null : trimmed.slice(at + 1);
    const digest = this.hex(trimmed.toLowerCase(), 12);
    let pseudo = '';
    if (local !== '') {
      pseudo = /\s/.test(local) ? `user- ${digest}` : `user-${digest}`;
      if (local !== local.toLowerCase()) pseudo = `U${pseudo.slice(1)}`;
    }
    return `${lead}${pseudo}${domain === null ? '' : `@${domain}`}${trail}`;
  }

  /** A display name (SSO `name`, Toggl `username`): `Name-<12 hex>`. */
  name(value: unknown): unknown {
    if (typeof value !== 'string') return this.scalar(value, 'name');
    return value.trim() === ''
      ? value
      : `Name-${this.hex(`name\0${value}`, 12)}`;
  }

  /** Any other free-text string: `redacted-<12 hex>` (presence kept). */
  text(value: string): string {
    return value === '' ? value : `redacted-${this.hex(`text\0${value}`, 12)}`;
  }

  /**
   * Strings replaced by `text` and numbers (JS and BSON) by `fakeNumber`,
   * recursively in arrays and plain objects; other scalars (booleans, null,
   * dates, `ObjectId`) kept.
   */
  redactDeep(value: unknown, path = 'value'): unknown {
    if (typeof value === 'string') return this.text(value);
    if (numericValue(value) !== undefined) return this.fakeNumber(value);
    if (isOpaqueValue(value)) return value;
    if (Array.isArray(value))
      return value.map((v, i) => this.redactDeep(v, `${path}[${i}]`));
    if (isPlainObject(value))
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          this.redactDeep(v, `${path}.${k}`),
        ]),
      );
    throw new UnsupportedValueError(`${path}: unsupported value type`);
  }

  /**
   * Non-string values of a PII field: numbers faked (per field domain),
   * other scalars kept, structures redacted.
   */
  private scalar(value: unknown, path: string): unknown {
    if (numericValue(value) !== undefined) return this.fakeNumber(value, path);
    if (isOpaqueValue(value)) return value;
    return this.redactDeep(value, path);
  }
}
