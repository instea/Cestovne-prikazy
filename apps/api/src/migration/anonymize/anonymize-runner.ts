import mongoose, { type Connection, type mongo } from 'mongoose';
import type { LegacyDoc } from '../legacy-mapping';
import { DEFAULT_TIMEZONE, UsageError } from '../runner';
import {
  anonymizeLegacy,
  compareMigrationFindings,
  legacyEmailCollisions,
  legacyLeaks,
} from './legacy-anonymizer';
import {
  emailCollisionWarning,
  MIN_SECRET_LENGTH,
  Pseudonymizer,
} from './pseudonym';

/**
 * MIG-02 anonymization run: read the restored prod dump's `users` /
 * `leaves` from `LEGACY_MONGO_URL` (never written), anonymize, check, and
 * write them to `ANONYMIZED_MONGO_URL` (database `cestaky`, so its
 * `mongodump` restores exactly like a prod dump). Nothing is written when a
 * check fails.
 */

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_REFUSED = 2;
/** PII check or MIG-01 finding check failed; nothing written. */
export const EXIT_CHECK_FAILED = 3;

export interface AnonymizeArgs {
  replace: boolean;
  /** Write even when MIG-01 finding counts by code differ (reported). */
  allowFindingDrift: boolean;
}

export function parseAnonymizeArgs(argv: readonly string[]): AnonymizeArgs {
  const args: AnonymizeArgs = { replace: false, allowFindingDrift: false };
  for (const a of argv) {
    if (a === '--replace') args.replace = true;
    else if (a === '--allow-finding-drift') args.allowFindingDrift = true;
    else throw new UsageError(`Unknown argument: ${a}`);
  }
  return args;
}

export interface AnonymizeEnv {
  secret: string;
  sourceUrl: string;
  targetUrl: string;
  timezone: string;
}

/** Refuses to run without the secret and both database URLs. */
export function anonymizeEnv(
  env: Record<string, string | undefined>,
): AnonymizeEnv {
  const secret = env.ANONYMIZE_SECRET ?? '';
  if (secret === '')
    throw new UsageError(
      'ANONYMIZE_SECRET is required (random per rehearsal, e.g. `openssl rand -hex 32`; never store it in the repo)',
    );
  if (secret.length < MIN_SECRET_LENGTH)
    throw new UsageError(
      `ANONYMIZE_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  const sourceUrl = env.LEGACY_MONGO_URL?.trim();
  if (!sourceUrl) throw new UsageError('LEGACY_MONGO_URL is required');
  const targetUrl = env.ANONYMIZED_MONGO_URL?.trim();
  if (!targetUrl) throw new UsageError('ANONYMIZED_MONGO_URL is required');
  const timezone = env.DEFAULT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  return { secret, sourceUrl, targetUrl, timezone };
}

export interface AnonymizeOptions extends AnonymizeArgs, AnonymizeEnv {
  log?: (line: string) => void;
}

const COLLECTIONS = ['users', 'leaves'] as const;

/** Reads, anonymizes, checks and writes; returns the exit code. */
export async function runAnonymize(opts: AnonymizeOptions): Promise<number> {
  const log = opts.log ?? (() => undefined);
  const p = new Pseudonymizer(opts.secret);
  let source: Connection | undefined;
  let target: Connection | undefined;
  try {
    const noAuto = { autoCreate: false, autoIndex: false };
    source = await mongoose
      .createConnection(opts.sourceUrl, noAuto)
      .asPromise();
    target = await mongoose
      .createConnection(opts.targetUrl, noAuto)
      .asPromise();
    if (
      source.host === target.host &&
      source.port === target.port &&
      source.name === target.name
    ) {
      log(
        'LEGACY_MONGO_URL and ANONYMIZED_MONGO_URL point to the same database',
      );
      return EXIT_REFUSED;
    }
    const src = source.db!;
    const dst = target.db!;

    if (!opts.replace) {
      for (const c of COLLECTIONS)
        if ((await dst.collection(c).estimatedDocumentCount()) > 0) {
          log(
            `Target collections users/leaves are not empty; use --replace to overwrite`,
          );
          return EXIT_REFUSED;
        }
    }

    // Natural order (as MIG-01 reads it) and exact BSON types are kept.
    const read = (c: string) =>
      src.collection(c).find({}, { promoteValues: false }).toArray() as Promise<
        LegacyDoc[]
      >;
    const original = {
      users: await read('users'),
      leaves: await read('leaves'),
    };
    log(
      `Read ${original.users.length} users and ${original.leaves.length} leaves`,
    );

    const output = anonymizeLegacy(original.users, original.leaves, p);

    const leaks = legacyLeaks(original, output);
    if (leaks.length > 0) {
      log(
        `PII check failed, nothing written. Original values remain at:\n- ${leaks.join('\n- ')}`,
      );
      return EXIT_CHECK_FAILED;
    }
    log(
      'PII check passed: no original id, email, name, degrees or address remains',
    );
    const collisions = legacyEmailCollisions(original.users, p);
    log(
      emailCollisionWarning(collisions) ??
        'Email case collisions: 0 (every distinct email keeps its own pseudonym)',
    );

    const findings = compareMigrationFindings(original, output, opts.timezone);
    log(`MIG-01 findings by code: ${JSON.stringify(findings.original)}`);
    if (findings.differences.length > 0) {
      const lines = findings.differences.map(
        (d) => `${d.code}: original ${d.original}, anonymized ${d.anonymized}`,
      );
      log(`MIG-01 finding counts differ:\n- ${lines.join('\n- ')}`);
      if (!opts.allowFindingDrift) {
        log('Nothing written (use --allow-finding-drift to write anyway)');
        return EXIT_CHECK_FAILED;
      }
    } else {
      log('MIG-01 finding counts by code are unchanged');
    }

    for (const c of COLLECTIONS) {
      if (opts.replace) await dst.collection(c).deleteMany({});
      const docs = output[c];
      if (docs.length > 0)
        await dst
          .collection<LegacyDoc>(c)
          .insertMany(docs as mongo.OptionalId<LegacyDoc>[], { ordered: true });
    }
    log(
      `Wrote ${output.users.length} users and ${output.leaves.length} leaves to database ${target.name}`,
    );
    return EXIT_OK;
  } finally {
    await source?.close();
    await target?.close();
  }
}
