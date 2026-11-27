import mongoose from 'mongoose';
import {
  type CliOutput,
  EXIT_FAILED,
  EXIT_USAGE,
  parseEmailArg,
  promoteAdmin,
  PROMOTE_ADMIN_USAGE,
} from './cli/promote-admin';
import { loadDotEnv } from './config/dotenv';

/**
 * Operator CLI (AUTH-04): `node apps/api/dist/cli.js promote-admin
 * --email=<email>` (dev: `pnpm --filter @leaves/api cli promote-admin
 * --email=<email>`). Uses only `MONGO_URL` (localhost default outside
 * production); does not start the HTTP server.
 */
const out: CliOutput = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

function mongoUrlFrom(
  env: Record<string, string | undefined>,
): string | undefined {
  return (
    env.MONGO_URL?.trim() ||
    (env.NODE_ENV === 'production'
      ? undefined
      : 'mongodb://localhost:27017/cestaky')
  );
}

async function main(argv: readonly string[]): Promise<number> {
  loadDotEnv();
  const [command, ...rest] = argv;
  if (command !== 'promote-admin') {
    out.stderr(PROMOTE_ADMIN_USAGE);
    return EXIT_USAGE;
  }
  const email = parseEmailArg(rest);
  if (!email?.trim()) {
    out.stderr(PROMOTE_ADMIN_USAGE);
    return EXIT_USAGE;
  }
  const url = mongoUrlFrom(process.env);
  if (!url) {
    out.stderr('MONGO_URL is required');
    return EXIT_USAGE;
  }
  const connection = mongoose.createConnection(url, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: false,
  });
  try {
    await connection.asPromise();
    return await promoteAdmin(connection, email, out);
  } finally {
    await connection.close().catch(() => undefined);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    out.stderr(err instanceof Error ? err.message : String(err));
    process.exit(EXIT_FAILED);
  },
);
