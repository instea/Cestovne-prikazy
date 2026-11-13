import { EXIT_FAILED, EXIT_REFUSED } from './anonymize/anonymize-runner';
import {
  parseRecordArgs,
  recordEnv,
  runRecord,
} from './anonymize/record-runner';
import { UsageError } from './runner';

/**
 * MIG-02 CLI, run by the operator on the server host (runbook:
 * apps/api/test/parity/README.md): `node dist/migration/record-parity-fixtures.js
 * --earliest YYYY-MM [--now YYYY-MM-DD] [--out <file>] [--delay-ms <ms>]`
 * (dev: `pnpm --filter @leaves/api record:parity-fixtures`). Env:
 * ANONYMIZE_SECRET (same as anonymize-legacy), SSO_URI, SSO_USERNAME,
 * SSO_PASSWORD, TOGGL_REPORTS_BASE_URL (default: real Toggl).
 * Exit: 0 written, 1 failure, 2 refused, 3 leak check failed (nothing written).
 */
async function main(): Promise<number> {
  const log = (line: string) => process.stdout.write(`${line}\n`);
  try {
    const args = parseRecordArgs(process.argv.slice(2));
    const env = recordEnv(process.env);
    return await runRecord({ ...args, ...env, log });
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
    process.stderr.write(`Recording failed: ${String(err)}\n`);
    process.exit(EXIT_FAILED);
  },
);
