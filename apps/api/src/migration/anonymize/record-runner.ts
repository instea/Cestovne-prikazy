import { writeFile } from 'node:fs/promises';
import { UsageError } from '../runner';
import {
  fixtureEmailCollisions,
  fixtureLeaks,
  FixturePseudonymizer,
  parityMonths,
} from './parity-fixtures';
import {
  NON_FINITE_RANGE,
  type RecordFetch,
  recordFixtures,
} from './parity-recorder';
import {
  emailCollisionWarning,
  MIN_SECRET_LENGTH,
  Pseudonymizer,
} from './pseudonym';
import { EXIT_CHECK_FAILED, EXIT_OK } from './anonymize-runner';

/**
 * MIG-02 fixture recording run: record real SSO / Toggl answers (memory
 * only), pseudonymize them with the rehearsal's `ANONYMIZE_SECRET`, check
 * that no original value survives, then write `sso-toggl-fixtures-<date>.json`
 * (a `FixtureSet` the parity harness takes with `--fixtures <file>`).
 */

export const TOGGL_DEFAULT_BASE_URL =
  'https://api.track.toggl.com/reports/api/v3';

export interface RecordArgs {
  /** `YYYY-MM` of the earliest leave `startDate` in the rehearsal dump. */
  earliest: string;
  /** Defines "current month"; pass the same `--now` to `pnpm parity`. */
  now: Date;
  out: string | undefined;
  delayMs: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRecordArgs(
  argv: readonly string[],
  today = new Date(),
): RecordArgs {
  const args: RecordArgs = {
    earliest: '',
    now: today,
    out: undefined,
    delayMs: 1000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--'))
        throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === '--earliest') args.earliest = value();
    else if (a === '--now') {
      const v = value();
      if (!DATE.test(v)) throw new UsageError('--now must be YYYY-MM-DD');
      args.now = new Date(`${v}T12:00:00Z`);
    } else if (a === '--out') args.out = value();
    else if (a === '--delay-ms') {
      args.delayMs = Number(value());
      if (!Number.isInteger(args.delayMs) || args.delayMs < 0)
        throw new UsageError('--delay-ms must be a non-negative integer');
    } else throw new UsageError(`Unknown argument: ${a}`);
  }
  if (!/^\d{4}-\d{2}$/.test(args.earliest))
    throw new UsageError(
      '--earliest YYYY-MM (month of the earliest leave) is required',
    );
  return args;
}

export interface RecordEnv {
  secret: string;
  ssoUri: string;
  ssoUsername: string;
  ssoPassword: string;
  togglBaseUrl: string;
}

export function recordEnv(env: Record<string, string | undefined>): RecordEnv {
  const secret = env.ANONYMIZE_SECRET ?? '';
  if (secret.length < MIN_SECRET_LENGTH)
    throw new UsageError(
      `ANONYMIZE_SECRET is required (the same value as for anonymize-legacy, at least ${MIN_SECRET_LENGTH} characters)`,
    );
  const need = (name: string) => {
    const v = env[name];
    if (!v) throw new UsageError(`${name} is required`);
    return v;
  };
  return {
    secret,
    ssoUri: need('SSO_URI'),
    ssoUsername: need('SSO_USERNAME'),
    ssoPassword: need('SSO_PASSWORD'),
    togglBaseUrl: env.TOGGL_REPORTS_BASE_URL || TOGGL_DEFAULT_BASE_URL,
  };
}

export interface RecordRunOptions extends RecordArgs, RecordEnv {
  fetch?: RecordFetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function runRecord(o: RecordRunOptions): Promise<number> {
  const log = o.log ?? (() => undefined);
  const months = parityMonths(o.earliest, o.now);
  log(
    `Recording ${months.length} months for --earliest ${o.earliest} --now ${isoDay(o.now)}`,
  );
  const raw = await recordFixtures({
    ssoUri: o.ssoUri,
    ssoUsername: o.ssoUsername,
    ssoPassword: o.ssoPassword,
    togglBaseUrl: o.togglBaseUrl,
    months,
    extraRanges: [NON_FINITE_RANGE],
    fetch: o.fetch,
    sleep: o.sleep,
    delayMs: o.delayMs,
    log,
  });
  const p = new Pseudonymizer(o.secret);
  const out = new FixturePseudonymizer(p).fixtureSet(raw);
  const leaks = fixtureLeaks(raw, out);
  if (leaks.length > 0) {
    log(
      `Leak check failed, nothing written. Original values remain at:\n- ${leaks.join('\n- ')}`,
    );
    return EXIT_CHECK_FAILED;
  }
  log(
    emailCollisionWarning(fixtureEmailCollisions(raw, p)) ??
      'Email case collisions: 0 (every distinct SSO email keeps its own pseudonym)',
  );
  const file = o.out ?? `sso-toggl-fixtures-${isoDay(new Date())}.json`;
  await writeFile(file, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
  log(
    `Wrote ${file} (${out.toggl.length} Toggl answers). Run the harness with --now ${isoDay(o.now)}.`,
  );
  return EXIT_OK;
}
