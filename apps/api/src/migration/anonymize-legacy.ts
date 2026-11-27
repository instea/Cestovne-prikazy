import {
  anonymizeEnv,
  EXIT_FAILED,
  EXIT_REFUSED,
  parseAnonymizeArgs,
  runAnonymize,
} from './anonymize/anonymize-runner';
import { UsageError } from './runner';

/**
 * MIG-02 CLI, run by the operator on the server host (runbook:
 * apps/api/test/parity/README.md): `node dist/migration/anonymize-legacy.js
 * [--replace] [--allow-finding-drift]` (dev: `pnpm --filter @leaves/api
 * anonymize:legacy`). Env: ANONYMIZE_SECRET (required, random per
 * rehearsal), LEGACY_MONGO_URL (restored prod dump, read only),
 * ANONYMIZED_MONGO_URL (output database), DEFAULT_TIMEZONE.
 * Exit: 0 written, 1 failure, 2 refused, 3 check failed (nothing written).
 * Never reads `.env`: the secret and URLs are given explicitly.
 */
async function main(): Promise<number> {
  const log = (line: string) => process.stdout.write(`${line}\n`);
  try {
    const args = parseAnonymizeArgs(process.argv.slice(2));
    const env = anonymizeEnv(process.env);
    return await runAnonymize({ ...args, ...env, log });
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
    process.stderr.write(`Anonymization failed: ${String(err)}\n`);
    process.exit(EXIT_FAILED);
  },
);
