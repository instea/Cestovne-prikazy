import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/** NFR-12 `scripts/check-deprecated.mjs`, run as in the CI `audit` job. */
const SCRIPT = resolve(__dirname, '../../../../scripts/check-deprecated.mjs');
const dir = mkdtempSync(join(tmpdir(), 'check-deprecated-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const LOCKFILE = `lockfileVersion: '9.0'

importers:

  apps/api:
    dependencies:
      direct-dep:
        specifier: ^1.0.0
        version: 1.0.0

packages:

  direct-dep@1.0.0:
    resolution: {integrity: sha512-a}
    deprecated: Direct dep is no longer maintained

  '@scope/transitive@2.0.0':
    resolution: {integrity: sha512-b}
    deprecated: 'Use something else'

  fine@3.0.0:
    resolution: {integrity: sha512-c}

  dev-only@4.0.0:
    resolution: {integrity: sha512-d}
    deprecated: dev only

snapshots:

  direct-dep@1.0.0:
    deprecated: not a package entry
`;

function run(ls: unknown, lockfile = LOCKFILE) {
  const lockPath = join(dir, 'pnpm-lock.yaml');
  const lsPath = join(dir, 'ls.json');
  writeFileSync(lockPath, lockfile);
  writeFileSync(lsPath, JSON.stringify(ls));
  try {
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT, '--lockfile', lockPath, '--ls-json', lsPath],
      { encoding: 'utf8' },
    );
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status: number; stdout: string };
    return { code: e.status, stdout: e.stdout };
  }
}

const importer = (dependencies: Record<string, unknown>) => [
  { name: 'leaves', version: '0.0.0', path: '/repo' },
  {
    name: '@leaves/api',
    version: '0.0.0',
    path: '/repo/apps/api',
    dependencies,
  },
];

describe('check-deprecated (NFR-12)', () => {
  it('fails on a deprecated direct production dependency', () => {
    const { code, stdout } = run(
      importer({ 'direct-dep': { version: '1.0.0' } }),
    );
    expect(code).toBe(1);
    expect(stdout).toContain(
      '::error title=Deprecated direct dependency::direct-dep@1.0.0: Direct dep is no longer maintained',
    );
  });

  it('only warns on a deprecated transitive dependency', () => {
    const { code, stdout } = run(
      importer({
        fine: {
          version: '3.0.0',
          dependencies: { '@scope/transitive': { version: '2.0.0' } },
        },
      }),
    );
    expect(code).toBe(0);
    expect(stdout).toContain(
      '::warning title=Deprecated dependency::@scope/transitive@2.0.0: Use something else',
    );
    expect(stdout).toContain('0 direct, 1 transitive');
  });

  it('ignores packages outside the production tree and workspace links', () => {
    const { code, stdout } = run(
      importer({
        '@leaves/shared': {
          version: 'link:../../packages/shared',
          dependencies: { fine: { version: '3.0.0' } },
        },
      }),
    );
    expect(code).toBe(0);
    expect(stdout).not.toContain('dev-only');
    expect(stdout).toContain('0 direct, 0 transitive');
  });

  it('passes on the repository itself', () => {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      cwd: resolve(__dirname, '../../../..'),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    expect(stdout).toMatch(/Deprecated production dependencies: 0 direct/);
  });
});
