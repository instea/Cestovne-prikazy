import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Nearest ancestor of `start` that holds `pnpm-workspace.yaml`. */
export function findWorkspaceRoot(start: string): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Local development only (SET-04): load `<workspace root>/.env` into
 * `process.env`. Variables already set win. Production (k8s) never reads a
 * file. Returns the loaded path, if any.
 */
export function loadDotEnv(
  start: string = __dirname,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.NODE_ENV === 'production') return undefined;
  const root = findWorkspaceRoot(start);
  const file = root && join(root, '.env');
  if (!file || !existsSync(file)) return undefined;
  process.loadEnvFile(file);
  return file;
}
