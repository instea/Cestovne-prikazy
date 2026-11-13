import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWorkspaceRoot, loadDotEnv } from './dotenv';

describe('loadDotEnv', () => {
  let root: string;
  let start: string;
  const env: Record<string, string | undefined> = {};

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'leaves-env-'));
    start = join(root, 'apps', 'api', 'dist', 'config');
    mkdirSync(start, { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    for (const k of Object.keys(env)) delete env[k];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.LEAVES_TEST_A;
    delete process.env.LEAVES_TEST_B;
  });

  it('finds the workspace root by walking up', () => {
    expect(findWorkspaceRoot(start)).toBe(root);
    expect(findWorkspaceRoot(tmpdir())).toBeUndefined();
  });

  it('loads <root>/.env without overriding existing variables', () => {
    writeFileSync(
      join(root, '.env'),
      'LEAVES_TEST_A=from-file\nLEAVES_TEST_B=from-file\n',
    );
    process.env.LEAVES_TEST_B = 'from-env';
    expect(loadDotEnv(start, process.env)).toBe(join(root, '.env'));
    expect(process.env.LEAVES_TEST_A).toBe('from-file');
    expect(process.env.LEAVES_TEST_B).toBe('from-env');
  });

  it('does nothing when .env is missing', () => {
    expect(loadDotEnv(start, process.env)).toBeUndefined();
  });

  it('does nothing in production', () => {
    writeFileSync(join(root, '.env'), 'LEAVES_TEST_A=from-file\n');
    expect(
      loadDotEnv(start, { ...process.env, NODE_ENV: 'production' }),
    ).toBeUndefined();
    expect(process.env.LEAVES_TEST_A).toBeUndefined();
  });
});
