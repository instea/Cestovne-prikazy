/**
 * MIG-03: recorded fixtures must not contain real secrets. Every
 * `togglApiToken`, Toggl key token, SSO credential and `Authorization`
 * value must be a placeholder (`PARITY_…` or `REDACTED…`); the harness
 * refuses to run otherwise. Scrub recorded sets before use.
 */
import type { FixtureSet } from './fixtures.mts';

export const isPlaceholder = (v: unknown): boolean =>
  typeof v === 'string' && /^(PARITY_|REDACTED)/.test(v);

/** Finds `{ key: 'togglApiToken', value }` pairs and auth-like strings. */
function walk(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    if (o.key === 'togglApiToken' && 'value' in o && !isPlaceholder(o.value))
      out.push(`${path}: togglApiToken is not a placeholder`);
    for (const [k, v] of Object.entries(o)) {
      if (/^(authorization|togglApiToken|token|password)$/i.test(k)) {
        if (typeof v === 'string' && !isPlaceholder(v))
          out.push(`${path}.${k}: not a placeholder`);
      }
      walk(v, `${path}.${k}`, out);
    }
    return;
  }
  if (typeof value === 'string' && /^(Basic|Bearer) \S{8,}/i.test(value))
    out.push(`${path}: looks like an Authorization value`);
}

/** Problems found, `[]` when the set is clean. */
export function scanFixtureSet(set: FixtureSet): string[] {
  const out: string[] = [];
  if (!isPlaceholder(set.sso.username))
    out.push('sso.username: not a placeholder');
  if (!isPlaceholder(set.sso.password))
    out.push('sso.password: not a placeholder');
  walk(set.sso.response, 'sso.response', out);
  set.toggl.forEach((f, i) => {
    if (!isPlaceholder(f.key.token))
      out.push(`toggl[${i}].key.token: not a placeholder`);
    walk(f.response, `toggl[${i}].response`, out);
  });
  return out;
}
