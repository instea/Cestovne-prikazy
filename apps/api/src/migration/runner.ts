import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import mongoose, { type Connection } from 'mongoose';
import { AUDIT_LOG_COLLECTION } from '../audit/audit-log.schema';
import { RefreshToken, RefreshTokenSchema } from '../auth/refresh-token.schema';
import { Leave, LeaveSchema } from '../leaves/leave.schema';
import { User, UserSchema } from '../users/user.schema';
import { type LegacyDoc, migrateLegacy } from './legacy-mapping';
import {
  buildReport,
  EXIT_FAILED,
  EXIT_REFUSED,
  exitCodeFor,
  renderDecisionsCsv,
  renderMarkdown,
} from './report';
import { sameDatabase } from './same-database';

export const DEFAULT_TIMEZONE = 'Europe/Bratislava';

export interface CliArgs {
  dryRun: boolean;
  replace: boolean;
  reportDir: string | undefined;
}

export class UsageError extends Error {}

/** `[--dry-run] [--replace] [--report-dir <path>]`. */
export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { dryRun: false, replace: false, reportDir: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--replace') args.replace = true;
    else if (a === '--report-dir') {
      const dir = argv[++i];
      if (!dir || dir.startsWith('--'))
        throw new UsageError('--report-dir needs a path');
      args.reportDir = dir;
    } else if (a.startsWith('--report-dir=')) {
      args.reportDir = a.slice('--report-dir='.length);
    } else {
      throw new UsageError(`Unknown argument: ${a}`);
    }
  }
  return args;
}

export interface MigrationEnv {
  legacyMongoUrl: string;
  mongoUrl: string;
  timezone: string;
}

/** Only the variables the script needs (not the full app config). */
export function migrationEnv(
  env: Record<string, string | undefined>,
): MigrationEnv {
  const legacy = env.LEGACY_MONGO_URL?.trim();
  if (!legacy) throw new UsageError('LEGACY_MONGO_URL is required');
  const target =
    env.MONGO_URL?.trim() ||
    (env.NODE_ENV === 'production'
      ? undefined
      : 'mongodb://localhost:27017/cestaky');
  if (!target) throw new UsageError('MONGO_URL is required');
  const timezone = env.DEFAULT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new UsageError('DEFAULT_TIMEZONE must be a valid IANA timezone');
  }
  return { legacyMongoUrl: legacy, mongoUrl: target, timezone };
}

/** `2026-11-06T10-15-02Z` (safe as a directory name). */
export function reportTimestamp(d: Date): string {
  return d
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(':', '-');
}

export interface RunOptions extends CliArgs, MigrationEnv {
  /** Injectable clock (tests). */
  now?: () => Date;
  /** Line logger (CLI: stdout/stderr). */
  log?: (line: string) => void;
}

export interface RunOutcome {
  exitCode: number;
  reportDir?: string;
}

/**
 * MIG-01 run: read legacy users/leaves (never written), map, write target
 * (unless dry run) and the report. Exit codes: 0 ok, 1 failure, 2 refused,
 * 3 finished with errors.
 */
export async function runMigration(opts: RunOptions): Promise<RunOutcome> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => undefined);
  const startedAt = now();

  let source: Connection | undefined;
  let target: Connection | undefined;
  try {
    // No implicit collection/index creation: a dry run (and a refused run)
    // must not touch the target; indexes are synced explicitly below.
    const noAuto = { autoCreate: false, autoIndex: false };
    source = await mongoose
      .createConnection(opts.legacyMongoUrl, noAuto)
      .asPromise();
    target = await mongoose.createConnection(opts.mongoUrl, noAuto).asPromise();
    if (sameDatabase(source, target)) {
      log('LEGACY_MONGO_URL and MONGO_URL point to the same database');
      return { exitCode: EXIT_REFUSED };
    }

    const Users = target.model(User.name, UserSchema);
    const Leaves = target.model(Leave.name, LeaveSchema);
    const Tokens = target.model(RefreshToken.name, RefreshTokenSchema);

    // NFR-06: the audit log starts at cutover. Raw collection access: the
    // AuditLog model's append-only hooks block Mongoose deletes.
    const auditLogs = target.db!.collection(AUDIT_LOG_COLLECTION);

    if (!opts.dryRun && !opts.replace) {
      const [u, l, a] = await Promise.all([
        Users.estimatedDocumentCount(),
        Leaves.estimatedDocumentCount(),
        auditLogs.estimatedDocumentCount(),
      ]);
      if (u > 0 || l > 0) {
        log(
          'Target collections users/leaves are not empty; use --replace to overwrite',
        );
        return { exitCode: EXIT_REFUSED };
      }
      if (a > 0) {
        log(
          'Target collection auditlogs is not empty; use --replace to overwrite',
        );
        return { exitCode: EXIT_REFUSED };
      }
    }

    // Only `users` and `leaves` are read; natural order (no sort).
    const db = source.db!;
    const [sourceUsers, sourceLeaves] = await Promise.all([
      db.collection<LegacyDoc>('users').find({}).toArray(),
      db.collection<LegacyDoc>('leaves').find({}).toArray(),
    ]);
    log(`Read ${sourceUsers.length} users, ${sourceLeaves.length} leaves`);

    const result = migrateLegacy(sourceUsers, sourceLeaves, {
      timezone: opts.timezone,
      runStartedAt: startedAt,
    });

    if (!opts.dryRun) {
      // Delete first: stale target data must not block a new unique index.
      if (opts.replace) {
        await Users.deleteMany({});
        await Leaves.deleteMany({});
        await Tokens.deleteMany({});
        await auditLogs.deleteMany({});
      }
      await Promise.all([Users.syncIndexes(), Leaves.syncIndexes()]);
      // Raw inserts: the mapped values are already schema-validated and keep
      // their `_id`-derived createdAt/updatedAt (Mongoose would overwrite them).
      // Ordered, so new `_id`s follow the source order (ATT-04 join order).
      if (result.users.length > 0)
        await Users.collection.insertMany(
          result.users.map((u) => ({ ...u })),
          { ordered: true },
        );
      if (result.leaves.length > 0)
        await Leaves.collection.insertMany(
          result.leaves.map((l) => ({ ...l })),
          { ordered: true },
        );
      log(
        `Wrote ${result.users.length} users (${result.placeholderUserIds.length} placeholders), ${result.leaves.length} leaves`,
      );
    }

    const report = buildReport(result, {
      startedAt,
      finishedAt: now(),
      dryRun: opts.dryRun,
      timezone: opts.timezone,
    });
    const dir = resolve(
      opts.reportDir ?? join('migration-report', reportTimestamp(startedAt)),
    );
    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(
        join(dir, 'report.json'),
        JSON.stringify(report, null, 2) + '\n',
      ),
      writeFile(join(dir, 'report.md'), renderMarkdown(report)),
      writeFile(join(dir, 'decisions.csv'), renderDecisionsCsv(report)),
    ]);
    const exitCode = exitCodeFor(report);
    log(
      `Report written to ${dir} (${report.findings.length} findings${exitCode ? ', with errors' : ''})`,
    );
    return { exitCode, reportDir: dir };
  } catch (err) {
    log(
      `Migration failed: ${err instanceof Error ? err.message : String(err)}. The target may be partial; rerun with --replace.`,
    );
    return { exitCode: EXIT_FAILED };
  } finally {
    await Promise.allSettled([source?.close(), target?.close()]);
  }
}
