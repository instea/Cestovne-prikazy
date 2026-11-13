#!/usr/bin/env node
/**
 * NFR-12: no deprecated production dependency.
 *
 * pnpm 12 `pnpm ls --json` carries no deprecation marker, but the lockfile
 * records `deprecated: <message>` on each deprecated package (from the npm
 * registry at resolution time). This script takes the production dependency
 * tree of every workspace package from `pnpm ls --prod --depth Infinity` and
 * looks each package up in the lockfile:
 * - deprecated transitive dependency → warning (GitHub annotation),
 * - deprecated direct dependency → error, exit 1.
 *
 * Usage: node scripts/check-deprecated.mjs [--lockfile <path>] [--ls-json <path>]
 * (the two options feed fixtures in tests; default: run `pnpm ls`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** `name@version` → deprecation message, from the lockfile `packages:` sections. */
export function deprecatedFromLockfile(text) {
  const result = new Map();
  let inPackages = false;
  let current;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      inPackages = line.startsWith('packages:');
      current = undefined;
      continue;
    }
    if (!inPackages) continue;
    const key = /^ {2}'?([^\s'][^']*?)'?:\s*$/.exec(line);
    if (key) {
      current = key[1];
      continue;
    }
    const dep = /^ {4}deprecated:\s*(.*)$/.exec(line);
    if (dep && current) result.set(current, dep[1].replace(/^['"]|['"]$/g, ''));
  }
  return result;
}

/** Production packages of every importer: `{ direct, all }` as `name@version`. */
export function productionPackages(lsJson) {
  const direct = new Set();
  const all = new Set();
  const visit = (deps, isDirect) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      if (!info?.version || info.version.startsWith('link:')) {
        visit(info?.dependencies, false);
        continue;
      }
      const id = `${name}@${info.version}`;
      if (isDirect) direct.add(id);
      if (!all.has(id)) {
        all.add(id);
        visit(info.dependencies, false);
      }
    }
  };
  for (const importer of lsJson) visit(importer.dependencies, true);
  return { direct, all };
}

export function check(lockfileText, lsJson) {
  const deprecated = deprecatedFromLockfile(lockfileText);
  const { direct, all } = productionPackages(lsJson);
  const errors = [];
  const warnings = [];
  for (const id of [...all].sort()) {
    const message = deprecated.get(id);
    if (message === undefined) continue;
    (direct.has(id) ? errors : warnings).push({ id, message });
  }
  return { errors, warnings };
}

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main() {
  const lockfile = readFileSync(
    option('--lockfile') ?? 'pnpm-lock.yaml',
    'utf8',
  );
  const lsPath = option('--ls-json');
  const ls = lsPath
    ? readFileSync(lsPath, 'utf8')
    : execFileSync(
        'pnpm',
        ['ls', '-r', '--prod', '--depth', 'Infinity', '--json'],
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      );
  const { errors, warnings } = check(lockfile, JSON.parse(ls));
  for (const w of warnings) {
    console.log(`::warning title=Deprecated dependency::${w.id}: ${w.message}`);
  }
  for (const e of errors) {
    console.log(
      `::error title=Deprecated direct dependency::${e.id}: ${e.message}`,
    );
  }
  console.log(
    `Deprecated production dependencies: ${errors.length} direct, ${warnings.length} transitive.`,
  );
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main());
}
