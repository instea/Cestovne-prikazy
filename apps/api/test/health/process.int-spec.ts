import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../support/mongo';

const apiDir = join(__dirname, '..', '..');

interface Run {
  code: number | null;
  output: string;
}

/** Spawn the built app (`dist/main.js`); `act` runs once it is listening. */
function runApp(
  env: Record<string, string>,
  act?: (pid: number) => Promise<void>,
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/main.js'], {
      cwd: apiDir,
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'test',
        HOSTED_DOMAIN: 'instea.co',
        GOOGLE_CLIENT_ID: 'client-id',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        LOG_LEVEL: 'info',
        ...env,
      },
    });
    let output = '';
    let acted = false;
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (act && !acted && output.includes('Leaves API')) {
        acted = true;
        act(child.pid!).catch(reject);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
  });
}

describe('process lifecycle (built app)', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['run', 'build'], { cwd: apiDir, stdio: 'ignore' });
  }, 120_000);

  it('exits 255 when MongoDB is unreachable at startup', async () => {
    const started = Date.now();
    const run = await runApp({
      MONGO_URL: 'mongodb://127.0.0.1:1/none?directConnection=true',
      PORT: '4191',
    });
    expect(run.code).toBe(255);
    expect(run.output).toContain('Connect to database failed -> exiting');
    expect(run.output).not.toContain('Leaves API');
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 30_000);

  it('exits 1 when SMTP is configured without MAIL_SENDER (NOT-01)', async () => {
    const run = await runApp({
      MONGO_URL: 'mongodb://127.0.0.1:1/none?directConnection=true',
      PORT: '4194',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
      MAIL_SENDER: '',
    });
    expect(run.code).toBe(1);
    expect(run.output).toContain(
      'Invalid configuration: MAIL_SENDER is required when SMTP is configured',
    );
    expect(run.output).not.toContain('Leaves API');
  }, 30_000);

  it('exits 1 naming a missing JWT_ACCESS_SECRET, never printing values (NFR-05)', async () => {
    const run = await runApp({
      MONGO_URL: 'mongodb://127.0.0.1:1/none?directConnection=true',
      PORT: '4195',
      JWT_ACCESS_SECRET: '',
      // Invalid on purpose: must be reported without its value.
      SMTP_PORT: 'CANARY-smtp-port',
      M2M_PASSWORD: 'CANARY-m2m-password',
    });
    expect(run.code).toBe(1);
    expect(run.output).toContain(
      'Missing required environment variable JWT_ACCESS_SECRET',
    );
    expect(run.output).toContain('SMTP_PORT must be a positive integer');
    expect(run.output).not.toContain('CANARY');
    expect(run.output).not.toContain('Leaves API');
  }, 30_000);

  it('exits 0 on SIGTERM without a disconnect error', async () => {
    const run = await runApp(
      { MONGO_URL: databaseUrl('lifecycle_sigterm'), PORT: '4192' },
      (pid) => {
        process.kill(pid, 'SIGTERM');
        return Promise.resolve();
      },
    );
    expect(run.code).toBe(0);
    expect(run.output).not.toContain(
      'Disconnected from the database -> exiting',
    );
  }, 30_000);

  describe('runtime DB loss', () => {
    let container: StartedMongoDBContainer;

    beforeAll(async () => {
      container = await new MongoDBContainer('mongo:8.0').start();
    }, 120_000);

    it('exits 254 when the DB connection is lost', async () => {
      const url = new URL(container.getConnectionString());
      url.pathname = '/lifecycle';
      url.searchParams.set('directConnection', 'true');
      const run = await runApp(
        { MONGO_URL: url.toString(), PORT: '4193' },
        async () => {
          await container.stop();
        },
      );
      expect(run.code).toBe(254);
      expect(run.output).toContain('Disconnected from the database -> exiting');
    }, 90_000);
  });
});
