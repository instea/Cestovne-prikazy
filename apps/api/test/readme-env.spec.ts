import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env.schema';

/**
 * DOC-03: the environment variable table of the root README lists exactly
 * the variables of the config schema (SET-02), plus the test-only and k8s
 * Mongo variables named in SET-02, nothing more and nothing less. Rows are
 * classified by the "Used by" column: `api` / `migration` rows are schema
 * variables, `tests` and `k8s Mongo` rows are not read by the app.
 */

const README = readFileSync(join(__dirname, '../../../README.md'), 'utf8');

/** SET-02 "Test-only" and "k8s Mongo only" lists. */
const TEST_ONLY = [
  'MONGO_TEST_URL',
  'E2E_MONGO_URL',
  'MAILPIT_API_URL',
  'E2E_BASE_URL',
];
const K8S_MONGO = [
  'MONGO_INITDB_ROOT_USERNAME',
  'MONGO_INITDB_ROOT_PASSWORD',
  'MONGO_APP_USERNAME',
  'MONGO_APP_PASSWORD',
];

interface Row {
  names: string[];
  usedBy: string[];
  required: string;
}

/** Cells of a Markdown table line (`|` inside code spans is not expected). */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** The first table after the `## Environment variables` heading. */
function envTable(markdown: string): Row[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) =>
    /^##\s+Environment variables\s*$/i.test(l),
  );
  if (start < 0) throw new Error('README has no "## Environment variables"');
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  const section = lines.slice(start + 1, end < 0 ? undefined : end);
  const first = section.findIndex((l) => l.trim().startsWith('|'));
  if (first < 0) throw new Error('no table under "Environment variables"');
  const table: string[] = [];
  for (const l of section.slice(first)) {
    if (!l.trim().startsWith('|')) break;
    table.push(l);
  }
  const header = cells(table[0]!).map((h) => h.toLowerCase());
  const col = (name: string) => {
    const i = header.findIndex((h) => h.startsWith(name));
    if (i < 0) throw new Error(`env table has no "${name}" column`);
    return i;
  };
  const [nameCol, usedCol, reqCol] = [
    col('name'),
    col('used by'),
    col('required in production'),
  ];
  col('default');
  col('description');
  return table
    .slice(2) // header and delimiter row
    .map(cells)
    .map((c) => ({
      names: [...c[nameCol]!.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map(
        (m) => m[1]!,
      ),
      usedBy: c[usedCol]!.split(',').map((u) => u.trim().toLowerCase()),
      required: c[reqCol]!.toLowerCase(),
    }));
}

const MINIMAL_ENV = {
  HOSTED_DOMAIN: 'example.com',
  GOOGLE_CLIENT_ID: 'client-id',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

/** Variable names of the config schema (keys of the loaded config). */
const schemaNames = Object.keys(loadConfig(MINIMAL_ENV)).sort();

/** A complete, valid production environment. */
const PROD_ENV: Record<string, string> = {
  ...MINIMAL_ENV,
  NODE_ENV: 'production',
  BASE_URL: 'https://leaves.example.com',
  MONGO_URL: 'mongodb://db/cestaky',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'user',
  SMTP_PASSWORD: 'password',
  MAIL_SENDER: 'leaves@example.com',
  APPROVAL_MAIL_RECEIVER: 'pm@example.com',
  M2M_USERNAME: 'm2m',
  M2M_PASSWORD: 'm2m-password',
  SSO_URI: 'https://sso.example.com/api/meta/all',
  SSO_USERNAME: 'sso',
  SSO_PASSWORD: 'sso-password',
};

/** True when a production start fails because `name` is missing. */
function requiredInProduction(name: string): boolean {
  const env = { ...PROD_ENV };
  delete env[name];
  if (name === 'NODE_ENV') return false; // unset NODE_ENV = development
  try {
    loadConfig(env);
    return false;
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    return err.problems.some((p) => p.includes(name));
  }
}

describe('README environment variable table (DOC-03)', () => {
  const rows = envTable(README);
  const names = rows.flatMap((r) => r.names);
  const isSchemaRow = (r: Row) =>
    r.usedBy.some((u) => u === 'api' || u === 'migration');
  const schemaRows = rows.filter(isSchemaRow);
  const listed = (filter: (r: Row) => boolean) =>
    rows
      .filter(filter)
      .flatMap((r) => r.names)
      .sort();

  it('parses one or more names on every row', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.names.length).toBeGreaterThan(0);
  });

  it('lists every variable once', () => {
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('uses only the known "Used by" values', () => {
    const known = ['api', 'migration', 'tests', 'k8s mongo'];
    for (const r of rows) {
      for (const u of r.usedBy) expect(known, r.names.join()).toContain(u);
    }
  });

  it('lists exactly the config schema variables as api / migration rows', () => {
    expect(listed(isSchemaRow)).toEqual(schemaNames);
  });

  it('lists exactly the SET-02 test-only and k8s Mongo variables', () => {
    expect(listed((r) => r.usedBy.includes('tests'))).toEqual(
      [...TEST_ONLY].sort(),
    );
    expect(listed((r) => r.usedBy.includes('k8s mongo'))).toEqual(
      [...K8S_MONGO].sort(),
    );
    expect(names.sort()).toEqual(
      [...schemaNames, ...TEST_ONLY, ...K8S_MONGO].sort(),
    );
  });

  it('marks "required in production" as the schema enforces it', () => {
    expect(() => loadConfig(PROD_ENV)).not.toThrow();
    for (const r of schemaRows) {
      for (const name of r.names) {
        expect(
          r.required.startsWith('yes'),
          `${name}: README says "${r.required}"`,
        ).toBe(requiredInProduction(name));
      }
    }
  });
});
