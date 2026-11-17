import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import {
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  containerNamed,
  findObject,
  loadManifest,
  PodLikeContainer,
  repoRoot,
  type ConfigMap,
  type Deployment,
} from './k8s';

/**
 * OPS-03 container smoke test of the production image. Opt-in because it
 * needs a built image: `pnpm test:image` builds `cestaky-leaves:local` and
 * runs this file with `LEAVES_IMAGE` set. In CI (NFR-09) the `image-scan` job
 * of security.yml runs it against the image it scans.
 * The container runs like the k8s pod: its securityContext (read-only root
 * filesystem, no capabilities; the user is left to the image, which is what
 * the non-root check verifies), tmpfs `/tmp`, env from the committed
 * ConfigMap plus dummy Secret values.
 */

const image = process.env.LEAVES_IMAGE;
const expectedVersion = process.env.LEAVES_IMAGE_VERSION;

describe.skipIf(!image)('production image (LEAVES_IMAGE)', () => {
  let network: StartedNetwork;
  let mongo: StartedMongoDBContainer;
  let app: StartedTestContainer;
  let baseUrl: string;

  beforeAll(async () => {
    network = await new Network().start();
    mongo = await new MongoDBContainer('mongo:8.0')
      .withNetwork(network)
      .withNetworkAliases('mongo')
      .start();
    const config = findObject<ConfigMap>(
      loadManifest('config.yml'),
      'ConfigMap',
      'cestaky-leaves-config',
    ).data;
    const deployment = findObject<Deployment>(
      loadManifest('app.yml'),
      'Deployment',
      'cestaky-leaves-deployment',
    );
    const { securityContext } = containerNamed(
      deployment.spec.template.spec,
      'cestaky-leaves',
    );
    app = await new PodLikeContainer(image!)
      .withSecurityContext(securityContext, { keepImageUser: true })
      .withTmpFs({ '/tmp': 'rw,noexec,nosuid' })
      .withNetwork(network)
      .withEnvironment({
        ...config,
        MONGO_URL: 'mongodb://mongo:27017/cestaky?directConnection=true',
        JWT_ACCESS_SECRET: 'smoke-test-secret-'.padEnd(40, 'x'),
        SMTP_USER: 'smoke',
        SMTP_PASSWORD: 'smoke',
        M2M_USERNAME: 'smoke',
        M2M_PASSWORD: 'smoke',
        SSO_USERNAME: 'smoke',
        SSO_PASSWORD: 'smoke',
      })
      .withExposedPorts(4100)
      .withWaitStrategy(Wait.forHttp('/health-check', 4100))
      .withStartupTimeout(60_000)
      .start();
    baseUrl = `http://${app.getHost()}:${app.getMappedPort(4100)}`;
  }, 180_000);

  afterAll(async () => {
    await app?.stop();
    await mongo?.stop();
    await network?.stop();
  });

  it('answers GET /health-check with 200 {"checkMongo":"ok"}', async () => {
    const res = await fetch(`${baseUrl}/health-check`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"checkMongo":"ok"}');
  });

  it('serves the SPA on GET /', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { accept: 'text/html' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await res.text()).toMatch(/<div id="root">/);
  });

  it('runs as a non-root user', async () => {
    const res = await app.exec(['id', '-u']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim()).not.toBe('0');
    expect(res.stdout.trim()).toBe('1000');
  });

  it('ships no devDependencies in node_modules', async () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'apps/api/package.json'), 'utf8'),
    ) as { devDependencies: Record<string, string> };
    const names = Object.keys(pkg.devDependencies);
    expect(names.length).toBeGreaterThan(0);
    const res = await app.exec([
      'node',
      '-e',
      `const fs = require('node:fs');
       const found = ${JSON.stringify(names)}.filter((n) => fs.existsSync('node_modules/' + n));
       const store = fs.existsSync('node_modules/.pnpm') ? fs.readdirSync('node_modules/.pnpm') : [];
       const dev = ['typescript@', 'vitest@', '@nestjs+cli@', 'testcontainers@', 'msw@'];
       found.push(...store.filter((d) => dev.some((p) => d.startsWith(p))));
       console.log(JSON.stringify(found));`,
    ]);
    expect(res.exitCode, res.output).toBe(0);
    expect(JSON.parse(res.stdout) as string[]).toEqual([]);
  });

  it.skipIf(!expectedVersion)('carries the APP_VERSION build arg', async () => {
    const res = await app.exec(['printenv', 'APP_VERSION']);
    expect(res.stdout.trim()).toBe(expectedVersion);
  });
});
