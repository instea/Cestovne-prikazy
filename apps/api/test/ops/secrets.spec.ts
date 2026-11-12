import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Container,
  loadManifest,
  manifestFiles,
  type PodSpec,
  readRepoFile,
} from './k8s';

/**
 * NFR-05 target 4, manifest lint (unit project, no containers; CI runs it
 * in security.yml): secret env values come only from k8s Secrets by
 * `secretKeyRef`, never from a ConfigMap, an inline `value` or a
 * whole-Secret `envFrom`. The repository keeps only `.env.example` with
 * empty secret values.
 */

/** Env names whose values come only from k8s Secrets (NFR-05 target 4). */
const SECRET_ENV_NAMES = [
  'JWT_ACCESS_SECRET',
  'MONGO_URL',
  'SMTP_PASSWORD',
  'M2M_USERNAME',
  'M2M_PASSWORD',
  'SSO_USERNAME',
  'SSO_PASSWORD',
  'MONGO_INITDB_ROOT_USERNAME',
  'MONGO_INITDB_ROOT_PASSWORD',
  'MONGO_APP_USERNAME',
  'MONGO_APP_PASSWORD',
  'LEGACY_MONGO_URL',
] as const;

const SECRET_NAMES: readonly string[] = SECRET_ENV_NAMES;

interface Found {
  where: string;
  container: Container;
}

function containers(): Found[] {
  const out: Found[] = [];
  for (const file of manifestFiles().filter((f) => f.endsWith('.yml')))
    for (const o of loadManifest(file)) {
      const pod = (o.spec as { template?: { spec?: PodSpec } } | undefined)
        ?.template?.spec;
      if (!pod) continue;
      for (const c of [...(pod.initContainers ?? []), ...pod.containers])
        out.push({
          where: `${file} ${o.metadata.name}/${c.name}`,
          container: c,
        });
    }
  return out;
}

describe('k8s manifests: secrets only by secretKeyRef (NFR-05)', () => {
  it('uses secretKeyRef (same key name) for every secret env', () => {
    const seen = new Set<string>();
    for (const { where, container } of containers())
      for (const e of container.env ?? []) {
        if (!SECRET_NAMES.includes(e.name)) continue;
        seen.add(e.name);
        expect(e.value, `${where} ${e.name}: inline value`).toBeUndefined();
        expect(e.valueFrom?.secretKeyRef?.key, `${where} ${e.name}`).toBe(
          e.name,
        );
        expect(e.valueFrom?.secretKeyRef?.name, where).toMatch(/-secrets$/);
      }
    // Every name is injected somewhere (LEGACY_MONGO_URL by the MIG-04
    // migrate-legacy Job): a renamed or dropped reference fails here.
    expect([...seen].sort()).toEqual([...SECRET_NAMES].sort());
  });

  it('never loads a whole Secret with envFrom', () => {
    for (const { where, container } of containers())
      for (const from of container.envFrom ?? [])
        expect(from.secretRef, `${where} envFrom secretRef`).toBeUndefined();
  });

  it('keeps secret names out of every ConfigMap', () => {
    for (const file of manifestFiles().filter((f) => f.endsWith('.yml')))
      for (const o of loadManifest(file)) {
        if (o.kind !== 'ConfigMap') continue;
        for (const key of Object.keys(o.data ?? {}))
          expect(SECRET_NAMES, `${file} ConfigMap key ${key}`).not.toContain(
            key,
          );
      }
  });
});

describe('.env.example and .gitignore (NFR-05)', () => {
  const example = readRepoFile('.env.example');
  const vars = new Map(
    example
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)] as const;
      }),
  );

  it('lists every app secret with an empty value', () => {
    for (const name of [
      'JWT_ACCESS_SECRET',
      'MONGO_URL',
      'SMTP_PASSWORD',
      'M2M_USERNAME',
      'M2M_PASSWORD',
      'SSO_USERNAME',
      'SSO_PASSWORD',
      'LEGACY_MONGO_URL',
    ])
      expect(vars.get(name), name).toBe('');
  });

  it('holds only NAME=value lines with known names', () => {
    const known = new Set(
      [
        ...readFileSync(
          join(__dirname, '..', '..', 'src', 'config', 'env.schema.ts'),
          'utf8',
        ).matchAll(/^ {2}([A-Z][A-Z0-9_]+): /gm),
      ].map((m) => m[1]),
    );
    for (const name of vars.keys()) expect(known, name).toContain(name);
  });

  it('ignores every .env file except .env.example, and secrets/', () => {
    const ignore = readRepoFile('.gitignore').split('\n');
    for (const line of ['.env', '.env.*', '!.env.example', 'secrets/'])
      expect(ignore).toContain(line);
  });
});
