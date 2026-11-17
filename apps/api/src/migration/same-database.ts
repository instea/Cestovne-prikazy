/**
 * MIG-01 / MIG-02 guard: source and target connections must not be the same
 * database (the run would read and overwrite the same collections).
 * Normalized so that spellings of one server compare equal: host names are
 * case-insensitive, loopback (`localhost`, `127.0.0.1`, `::1`, `[::1]`) is
 * one host, an omitted port is MongoDB's default 27017. Database names are
 * compared case-insensitively too (MongoDB refuses names differing only by
 * case), so the guard errs on the side of refusing.
 */

export const DEFAULT_MONGO_PORT = 27017;

/** What a Mongoose `Connection` exposes about where it points. */
export interface DbLocation {
  host?: string | null;
  port?: number | string | null;
  name?: string | null;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0:0:0:0:0:0:0:1']);

export function normalizeHost(host: string | null | undefined): string {
  let h = (host ?? '').trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  return LOOPBACK.has(h) ? 'localhost' : h;
}

export function normalizePort(port: number | string | null | undefined) {
  const n = Number(port);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MONGO_PORT;
}

export function sameDatabase(a: DbLocation, b: DbLocation): boolean {
  return (
    normalizeHost(a.host) === normalizeHost(b.host) &&
    normalizePort(a.port) === normalizePort(b.port) &&
    (a.name ?? '').toLowerCase() === (b.name ?? '').toLowerCase()
  );
}
