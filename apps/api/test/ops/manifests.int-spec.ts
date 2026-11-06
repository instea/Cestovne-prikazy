import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.schema';
import { MONGO_TEST_IMAGE } from '../support/global-setup';
import {
  containerNamed,
  deployDir,
  findObject,
  k8sDir,
  loadManifest,
  manifestFiles,
  readRepoFile,
  volumeNamed,
  type ConfigMap,
  type Deployment,
  type Ingress,
  type Job,
  type PersistentVolumeClaim,
  type Service,
  type StatefulSet,
} from './k8s';

/**
 * OPS-03: static checks of the Dockerfile and `deploy/k8s` manifests.
 * Cluster behaviour (pod Ready, Keel rollout) is verified at cutover (MIG-04);
 * schema validation is `pnpm test:k8s` (kubeconform -strict); `trivy config`
 * runs in CI (NFR-04).
 * TODO(NFR-09): the new ci.yml (image-scan or integration job) must run
 * `pnpm test:image` and `pnpm test:k8s`; NFR-04 and NFR-09 do not list them.
 * NFR-04: the security.yml `trivy fs` gate runs with
 * `--severity HIGH,CRITICAL`; the HIGH KSV-0109 false positives (config.yml,
 * mongo8-rs-init-script) are accepted in `.trivyignore.yaml`.
 */

const KEEL = {
  'keel.sh/policy': 'force',
  'keel.sh/match-tag': 'true',
  'keel.sh/trigger': 'poll',
  'keel.sh/pollSchedule': '@every 10m',
};

/** Secret keys of `cestaky-leaves-secrets` (OPS-03 data model). */
const APP_SECRET_KEYS = [
  'MONGO_URL',
  'JWT_ACCESS_SECRET',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'M2M_USERNAME',
  'M2M_PASSWORD',
  'SSO_USERNAME',
  'SSO_PASSWORD',
];

const CONFIG_KEYS = [
  'NODE_ENV',
  'BASE_URL',
  'HOSTED_DOMAIN',
  'GOOGLE_CLIENT_ID',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'MAIL_SENDER',
  'APPROVAL_MAIL_RECEIVER',
  'SSO_URI',
  'TOGGL_REPORTS_BASE_URL',
  'DEFAULT_TIMEZONE',
  'LOG_LEVEL',
  'ACCESS_TOKEN_TTL_SECONDS',
  'REFRESH_TOKEN_TTL_SECONDS',
];

const MONGO_IMAGE = /^mongo:8\.0@sha256:[0-9a-f]{64}$/;
const MONGO_MEMBER = 'mongo8-sfset-0.mongo8-headless.default.svc.cluster.local';

describe('deploy/k8s layout', () => {
  it('has the manifests named in OPS-03 and the unchanged Keel values', () => {
    expect(manifestFiles().sort()).toEqual([
      'app.yml',
      'config.yml',
      'ingress.yml',
      'keel/values.yaml',
      'mongo8-rs-init.yml',
      'mongo8.yml',
    ]);
    expect(existsSync(join(k8sDir, 'secrets.example.md'))).toBe(true);
  });

  it('keeps the Keel Helm values of the old cluster (Keel 0.22.4, poll 10m)', () => {
    const values = readFileSync(join(k8sDir, 'keel', 'values.yaml'), 'utf8');
    expect(values).toContain('tag: "0.22.4"');
    expect(values).toContain('defaultSchedule: "@every 10m"');
    expect(values).toContain('clusterIP: "10.152.183.200"');
  });
});

describe('app.yml', () => {
  const objects = loadManifest('app.yml');
  const deployment = findObject<Deployment>(
    objects,
    'Deployment',
    'cestaky-leaves-deployment',
  );
  const pod = deployment.spec.template.spec;
  const app = containerNamed(pod, 'cestaky-leaves');

  it('rolls out one replica without downtime and has the Keel annotations', () => {
    expect(deployment.metadata.annotations).toMatchObject(KEEL);
    expect(deployment.spec.replicas).toBe(1);
    expect(deployment.spec.strategy).toEqual({
      type: 'RollingUpdate',
      rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
    });
    expect(deployment.spec.template.metadata.labels).toMatchObject(
      deployment.spec.selector.matchLabels,
    );
  });

  it('pulls registry.instea.co/cestaky-leaves:latest with the registry secret', () => {
    expect(pod.imagePullSecrets).toEqual([{ name: 'instea-registry' }]);
    expect(app.image).toBe('registry.instea.co/cestaky-leaves:latest');
    expect(app.imagePullPolicy).toBe('Always');
    expect(app.ports).toEqual([
      expect.objectContaining({ containerPort: 4100 }),
    ]);
  });

  it('reads config from the ConfigMap and secrets from the Secret only', () => {
    expect(app.envFrom).toEqual([
      { configMapRef: { name: 'cestaky-leaves-config' } },
      { secretRef: { name: 'cestaky-leaves-secrets' } },
    ]);
    expect(app.env ?? []).toEqual([]);
  });

  it('uses the OPS-01 probes', () => {
    expect(app.readinessProbe).toEqual({
      httpGet: { path: '/health-check', port: 4100 },
      initialDelaySeconds: 5,
      periodSeconds: 5,
      timeoutSeconds: 3,
      failureThreshold: 3,
    });
    expect(app.livenessProbe).toEqual({
      tcpSocket: { port: 4100 },
      initialDelaySeconds: 30,
      periodSeconds: 20,
    });
  });

  it('runs non-root on a read-only root filesystem with a writable /tmp', () => {
    expect(app.securityContext).toMatchObject({
      runAsNonRoot: true,
      // Numeric uid of the image's `node` user: k8s cannot verify a named
      // user for runAsNonRoot.
      runAsUser: 1000,
      readOnlyRootFilesystem: true,
      allowPrivilegeEscalation: false,
    });
    const tmp = app.volumeMounts?.find((m) => m.mountPath === '/tmp');
    expect(tmp).toBeDefined();
    expect(volumeNamed(pod, tmp!.name).emptyDir).toBeDefined();
  });

  it('has the agreed resources and grace period', () => {
    expect(app.resources).toEqual({
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1', memory: '512Mi' },
    });
    expect(pod.terminationGracePeriodSeconds).toBe(15);
  });

  it('exposes cestaky-leaves-service on port 80 -> 4100', () => {
    const service = findObject<Service>(
      objects,
      'Service',
      'cestaky-leaves-service',
    );
    expect(service.spec.selector).toEqual(deployment.spec.selector.matchLabels);
    expect(service.spec.ports).toEqual([
      expect.objectContaining({ port: 80, targetPort: 4100 }),
    ]);
  });
});

describe('ingress.yml', () => {
  const ingress = findObject<Ingress>(
    loadManifest('ingress.yml'),
    'Ingress',
    'cestaky-ingress',
  );

  it('routes /cestaky/* to cestaky-leaves-service with the old rewrite', () => {
    expect(ingress.spec.ingressClassName).toBe('public');
    expect(ingress.metadata.annotations).toEqual({
      'nginx.ingress.kubernetes.io/rewrite-target': '/$1',
      'nginx.ingress.kubernetes.io/proxy-body-size': '1m',
    });
    expect(ingress.spec.rules).toEqual([
      {
        http: {
          paths: [
            {
              path: '/cestaky/?(.*)',
              pathType: 'ImplementationSpecific',
              backend: {
                service: {
                  name: 'cestaky-leaves-service',
                  port: { number: 80 },
                },
              },
            },
          ],
        },
      },
    ]);
  });
});

describe('config.yml', () => {
  const config = findObject<ConfigMap>(
    loadManifest('config.yml'),
    'ConfigMap',
    'cestaky-leaves-config',
  );

  it('holds exactly the non-secret keys, with production values', () => {
    expect(Object.keys(config.data).sort()).toEqual([...CONFIG_KEYS].sort());
    expect(config.data).toMatchObject({
      NODE_ENV: 'production',
      BASE_URL: 'https://cestaky.instea.co',
      HOSTED_DOMAIN: 'instea.co',
      GOOGLE_CLIENT_ID:
        '914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      MAIL_SENDER: 'automation@instea.co',
      APPROVAL_MAIL_RECEIVER: 'pm@instea.co',
      SSO_URI: 'https://sso-meta.instea.co/api/meta/all',
    });
    for (const value of Object.values(config.data)) {
      expect(typeof value).toBe('string');
    }
  });

  it('passes the production config validation together with the Secret keys', () => {
    const secrets = Object.fromEntries(
      APP_SECRET_KEYS.map((k) => [k, 'x'.repeat(32)]),
    );
    const loaded = loadConfig({ ...config.data, ...secrets });
    expect(loaded.NODE_ENV).toBe('production');
    expect(loaded.SMTP_SECURE).toBe(true);
  });
});

describe('mongo8.yml', () => {
  const objects = loadManifest('mongo8.yml');
  const sts = findObject<StatefulSet>(objects, 'StatefulSet', 'mongo8-sfset');
  const pod = sts.spec.template.spec;
  const mongo = containerNamed(pod, 'mongo8');

  it('keeps data on mongo8-pvc (2Gi, microk8s-hostpath)', () => {
    const pvc = findObject<PersistentVolumeClaim>(
      objects,
      'PersistentVolumeClaim',
      'mongo8-pvc',
    );
    expect(pvc.spec).toEqual({
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'microk8s-hostpath',
      resources: { requests: { storage: '2Gi' } },
    });
    const data = mongo.volumeMounts?.find((m) => m.mountPath === '/data/db');
    expect(volumeNamed(pod, data!.name).persistentVolumeClaim).toEqual({
      claimName: 'mongo8-pvc',
    });
  });

  it('has a headless Service for serviceName and a ClusterIP mongo8-service', () => {
    const headless = findObject<Service>(objects, 'Service', 'mongo8-headless');
    const service = findObject<Service>(objects, 'Service', 'mongo8-service');
    expect(sts.spec.serviceName).toBe('mongo8-headless');
    expect(headless.spec.clusterIP).toBe('None');
    expect(service.spec.clusterIP).toBeUndefined();
    for (const s of [headless, service]) {
      expect(s.spec.selector).toEqual(sts.spec.selector.matchLabels);
      expect(s.spec.ports).toEqual([
        expect.objectContaining({ port: 27017, targetPort: 27017 }),
      ]);
    }
    expect(sts.spec.template.metadata.labels).toMatchObject(
      sts.spec.selector.matchLabels,
    );
  });

  it('runs one digest-pinned mongo:8.0 as replica set rs0 with keyfile auth', () => {
    expect(sts.spec.replicas).toBe(1);
    expect(mongo.image).toMatch(MONGO_IMAGE);
    // NFR-12: tests run the very same MongoDB image as production.
    expect(MONGO_TEST_IMAGE).toBe(mongo.image);
    expect(mongo.args).toEqual([
      '--replSet',
      'rs0',
      '--keyFile',
      '/etc/mongo/keyfile',
      '--bind_ip_all',
      '--wiredTigerCacheSizeGB',
      '0.25',
    ]);
    expect(mongo.env).toEqual(
      ['MONGO_INITDB_ROOT_USERNAME', 'MONGO_INITDB_ROOT_PASSWORD'].map(
        (key) => ({
          name: key,
          valueFrom: { secretKeyRef: { name: 'mongo8-secrets', key } },
        }),
      ),
    );
  });

  it('mounts the keyfile from mongo8-secrets read-only with mode 0400', () => {
    const keyfileMount = mongo.volumeMounts?.find(
      (m) => m.mountPath === '/etc/mongo',
    );
    expect(keyfileMount?.readOnly).toBe(true);
    const secretVolume = pod.volumes?.find(
      (v) => v.secret?.secretName === 'mongo8-secrets',
    );
    expect(secretVolume?.secret).toEqual({
      secretName: 'mongo8-secrets',
      defaultMode: 0o400,
      items: [{ key: 'keyfile', path: 'keyfile' }],
    });
    // mongod (uid 999) must own the file: the init container copies it.
    const [init] = pod.initContainers ?? [];
    expect(init?.image).toBe(mongo.image);
    expect(
      init?.volumeMounts?.find((m) => m.name === secretVolume?.name)?.readOnly,
    ).toBe(true);
    expect(init?.command?.join(' ')).toMatch(
      /chmod 0?400 \/etc\/mongo\/keyfile/,
    );
  });

  it('is ready when mongosh can ping and has the agreed resources', () => {
    expect(mongo.readinessProbe?.exec?.command).toEqual([
      'mongosh',
      '--quiet',
      '--eval',
      "db.adminCommand('ping')",
    ]);
    expect(mongo.resources).toEqual({
      requests: { memory: '512Mi' },
      limits: { cpu: '1', memory: '1Gi' },
    });
  });
});

describe('mongo8-rs-init.yml', () => {
  const objects = loadManifest('mongo8-rs-init.yml');
  const job = findObject<Job>(objects, 'Job', 'mongo8-rs-init');
  const pod = job.spec.template.spec;
  const [init] = pod.containers;

  it('runs the init script with root credentials against the StatefulSet pod', () => {
    expect(pod.containers).toHaveLength(1);
    expect(init!.image).toMatch(MONGO_IMAGE);
    expect(pod.restartPolicy).toBe('OnFailure');
    const env = Object.fromEntries((init!.env ?? []).map((e) => [e.name, e]));
    for (const key of [
      'MONGO_INITDB_ROOT_USERNAME',
      'MONGO_INITDB_ROOT_PASSWORD',
      'MONGO_APP_USERNAME',
      'MONGO_APP_PASSWORD',
    ]) {
      expect(env[key]?.valueFrom?.secretKeyRef).toEqual({
        name: 'mongo8-secrets',
        key,
      });
    }
    expect(env.RS_MEMBER_HOST?.value).toBe(`${MONGO_MEMBER}:27017`);
  });

  it('mounts its script from the mongo8-rs-init-script ConfigMap', () => {
    const script = findObject<ConfigMap>(
      objects,
      'ConfigMap',
      'mongo8-rs-init-script',
    );
    expect(Object.keys(script.data)).toEqual(['init.js']);
    const volume = pod.volumes?.find(
      (v) => v.configMap?.name === 'mongo8-rs-init-script',
    );
    expect(
      init!.volumeMounts?.find((m) => m.name === volume?.name)?.mountPath,
    ).toBe('/scripts');
  });
});

describe('secrets', () => {
  const files = manifestFiles();

  it('commits no Secret object and no inline secret values', () => {
    for (const file of files.filter((f) => f.endsWith('.yml'))) {
      for (const o of loadManifest(file)) {
        expect(o.kind, `${file} ${o.metadata.name}`).not.toBe('Secret');
        expect(o.stringData).toBeUndefined();
      }
    }
    const config = findObject<ConfigMap>(
      loadManifest('config.yml'),
      'ConfigMap',
      'cestaky-leaves-config',
    );
    for (const key of APP_SECRET_KEYS) expect(config.data[key]).toBeUndefined();
  });

  it('finds no credentials anywhere under deploy/', () => {
    const patterns = [
      // URL with a literal user:password (`<placeholder>` / `$VAR` are fine)
      /mongodb(\+srv)?:\/\/[^<$\s/:@]+:[^<$\s@]+@/i,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /(password|secret|token)[ \t]*[:=][ \t]*['"]?[A-Za-z0-9+/_-]{8,}/i,
    ];
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    for (const path of walk(deployDir)) {
      const text = readFileSync(path, 'utf8');
      for (const p of patterns) expect(text, path).not.toMatch(p);
    }
  });

  it('documents every Secret key in secrets.example.md', () => {
    const doc = readFileSync(join(k8sDir, 'secrets.example.md'), 'utf8');
    for (const key of [
      'cestaky-leaves-secrets',
      'mongo8-secrets',
      ...APP_SECRET_KEYS,
      'MONGO_INITDB_ROOT_USERNAME',
      'MONGO_INITDB_ROOT_PASSWORD',
      'MONGO_APP_USERNAME',
      'MONGO_APP_PASSWORD',
      'keyfile',
      'authSource=cestaky&replicaSet=rs0',
    ]) {
      expect(doc).toContain(key);
    }
  });
});

describe('Dockerfile', () => {
  const dockerfile = readRepoFile('Dockerfile');
  const instructions = dockerfile
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  it('builds on digest-pinned node:24-slim in deps, build and runtime stages (NFR-12)', () => {
    const from = instructions.filter((l) => l.startsWith('FROM '));
    expect(from.map((l) => l.split(/\s+/)[1])).toSatisfy((images: string[]) =>
      images.every(
        (i) => /^node:24-slim@sha256:[0-9a-f]{64}$/.test(i) || !i.includes(':'),
      ),
    );
    for (const stage of ['deps', 'build', 'runtime']) {
      expect(from.some((l) => l.endsWith(` AS ${stage}`))).toBe(true);
    }
  });

  it('has APP_VERSION as its only build arg', () => {
    const args = instructions
      .filter((l) => l.startsWith('ARG '))
      .map((l) => l.slice(4).split('=')[0]);
    expect(new Set(args)).toEqual(new Set(['APP_VERSION']));
  });

  it('runs node dist/main.js as the node user on port 4100', () => {
    const runtime = instructions.slice(
      instructions.findIndex((l) => l.endsWith(' AS runtime')),
    );
    expect(runtime).toContain('USER node');
    expect(runtime).toContain('EXPOSE 4100');
    expect(runtime).toContain('CMD ["node", "dist/main.js"]');
    expect(runtime.some((l) => /NODE_ENV=production/.test(l))).toBe(true);
  });

  it('keeps node_modules, .git, env files and test output out of the context', () => {
    const ignore = readRepoFile('.dockerignore').split('\n');
    for (const entry of [
      '**/node_modules',
      '.git',
      '**/.env*',
      '**/coverage',
      '**/dist',
    ]) {
      expect(ignore).toContain(entry);
    }
  });
});
