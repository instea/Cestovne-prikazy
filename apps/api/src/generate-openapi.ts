import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateOpenApiDocument, OPENAPI_FILE } from './docs/generate';
import { serializeOpenApi } from './docs/openapi';

/**
 * DOC-02 `pnpm --filter @leaves/api openapi:generate [<file>]`: writes the
 * OpenAPI document (default: the committed `docs/api/openapi.json`). No
 * database or network needed (`docs/generate.ts`).
 */
async function main(): Promise<void> {
  const target = process.argv[2] ? resolve(process.argv[2]) : OPENAPI_FILE;
  writeFileSync(target, serializeOpenApi(await generateOpenApiDocument()));
  process.stdout.write(`Wrote ${target}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
