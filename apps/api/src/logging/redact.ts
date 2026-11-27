/** Replacement for a credential value in a log line. */
export const REDACTED = '[Redacted]';

/**
 * NFR-02 / SET-02: field names whose values never reach a log line, at any
 * depth, case-insensitive: anything containing `token` (accessToken,
 * refresh_token, idToken, togglApiToken…), `passw` (password, passwd),
 * `secret`, `authorization`, `cookie` (incl. set-cookie), `apikey` /
 * `api_key` / `api-key`, `credential`.
 */
const CREDENTIAL_KEY =
  /token|passw|secret|authori[sz]ation|cookie|api[-_]?key|credential/i;

export const isCredentialKey = (key: string): boolean =>
  CREDENTIAL_KEY.test(key);

/** Deeper values are replaced (log objects are never legitimately this deep). */
export const MAX_DEPTH = 16;

/**
 * A copy of `value` with every credential-like field replaced by
 * `[Redacted]`, shaped like `JSON.stringify` would see it: `toJSON()` is
 * applied (Date, ObjectId, Buffer…) and other class instances become their
 * own enumerable fields. Errors stay Errors (same prototype, message,
 * stack, cause; redacted copies of their fields), so pino's `err`
 * serializer still logs type, message and stack. Cycles become
 * `[Circular]`, values below `MAX_DEPTH` `[Truncated]`. The input is never
 * mutated.
 */
export function redactCredentials(value: unknown): unknown {
  return walk(value, 0, new WeakSet());
}

function walk(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (ancestors.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';

  ancestors.add(value);
  try {
    if (value instanceof Error) return cloneError(value, depth, ancestors);
    let source: unknown = value;
    if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
      source = (value as { toJSON: () => unknown }).toJSON();
      if (typeof source !== 'object' || source === null) return source;
      if (source === value) source = { ...value };
    }
    if (Array.isArray(source))
      return source.map((item) => walk(item, depth + 1, ancestors));
    return redactFields(source as object, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function redactFields(
  source: object,
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(source))
    out[key] = isCredentialKey(key) ? REDACTED : walk(v, depth + 1, ancestors);
  return out;
}

/** Non-enumerable Error fields kept on the copy (redacted where nested). */
const ERROR_FIELDS = ['name', 'message', 'stack', 'cause', 'errors'] as const;

function cloneError(
  err: Error,
  depth: number,
  ancestors: WeakSet<object>,
): Error {
  const copy = Object.create(Object.getPrototypeOf(err) as object) as Error;
  for (const field of ERROR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(err, field)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(err, field)!;
    if (descriptor.enumerable) continue; // copied below
    const v: unknown = (err as unknown as Record<string, unknown>)[field];
    Object.defineProperty(copy, field, {
      value: typeof v === 'string' ? v : walk(v, depth + 1, ancestors),
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  Object.assign(copy, redactFields(err, depth, ancestors));
  return copy;
}

const SERIALIZED_KEYS: ReadonlySet<string> = new Set(['req', 'res']);

/**
 * pino `formatters.log`: redacts every field of a log call's object except
 * those with their own serializer (`req`, `res`: pino-http serializes them
 * to a fixed field list, whose headers `REDACT_PATHS` censors).
 * Child-logger bindings do not pass through pino's log formatter; the only
 * ones are pino-http's (`req`, request id, `userId`), so app code must not
 * bind credentials with `logger.child(...)`.
 */
export function redactLogObject(
  object: Record<string, unknown>,
  skip: ReadonlySet<string> = SERIALIZED_KEYS,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(object)) {
    if (isCredentialKey(key)) out[key] = REDACTED;
    else if (skip.has(key)) out[key] = v;
    else out[key] = redactCredentials(v);
  }
  return out;
}
