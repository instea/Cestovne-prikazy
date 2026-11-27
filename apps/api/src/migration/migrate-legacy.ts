import { loadDotEnv } from '../config/dotenv';
import { EXIT_REFUSED } from './report';
import { migrationEnv, parseArgs, runMigration, UsageError } from './runner';

/**
 * MIG-01 CLI: `node dist/migration/migrate-legacy.js [--dry-run] [--replace]
 * [--report-dir <path>]` (dev: `pnpm --filter @leaves/api migrate:legacy`).
 * Env: LEGACY_MONGO_URL (required), MONGO_URL, DEFAULT_TIMEZONE.
 */
async function main(): Promise<number> {
  loadDotEnv();
  const log = (line: string) => process.stdout.write(`${line}\n`);
  try {
    const args = parseArgs(process.argv.slice(2));
    const env = migrationEnv(process.env);
    const { exitCode } = await runMigration({ ...args, ...env, log });
    return exitCode;
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n`);
      return EXIT_REFUSED;
    }
    throw err;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  },
);
