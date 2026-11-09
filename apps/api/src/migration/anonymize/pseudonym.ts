import { createHmac } from 'node:crypto';

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
 * Values carried over as they are: numbers, booleans, null/undefined,
 * `Date`, and BSON values (`ObjectId`, `Double`, `Int32`, `Long`, …, read
 * with `promoteValues: false`). None of them can hold a name or an email.
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

  /** Deterministic non-negative integer below 2^48 (numeric legacy values). */
  private number(domain: string, value: number | bigint): number {
    return Number.parseInt(this.hex(`${domain}\0${String(value)}`, 12), 16);
  }

  /**
   * User id (`users.id`, `leaves.requesterId` / `approverId`):
   * `anon-` + first 16 hex of HMAC(secret, id). Empty / blank strings and
   * missing values stay as they are (MIG-01 reports them the same way); a
   * number becomes another number (keeps the "not a string" finding).
   */
  userId(id: unknown): unknown {
    if (typeof id === 'string')
      return id.trim() === '' ? id : `anon-${this.hex(id, 16)}`;
    if (typeof id === 'number' || typeof id === 'bigint')
      return this.number('id', id);
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
   * Strings replaced by `text`, recursively in arrays and plain objects;
   * opaque values (numbers, dates, BSON) kept.
   */
  redactDeep(value: unknown, path = 'value'): unknown {
    if (typeof value === 'string') return this.text(value);
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

  /** Non-string values of a PII field: opaque kept, structures redacted. */
  private scalar(value: unknown, path: string): unknown {
    if (isOpaqueValue(value)) {
      if (typeof value === 'number' || typeof value === 'bigint')
        return this.number(path, value);
      return value;
    }
    return this.redactDeep(value, path);
  }
}
