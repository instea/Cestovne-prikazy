import 'reflect-metadata';
import type { ModuleMetadata } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp, type SetupOptions } from '../../src/app.setup';
import { CLOCK } from '../../src/common/clock';
import { type AppConfig, loadConfig } from '../../src/config/env.schema';
import {
  PROCESS_EXIT,
  type ProcessExit,
} from '../../src/database/connection-watcher';
import { TEST_ENV } from './env';
import { mailpitEndpoints } from './mailbox';
import { databaseUrl, testDatabaseName } from './mongo';
import { TestClock } from './test-clock';

export interface TestAppOptions {
  /** Extra / changed env vars on top of `TEST_ENV` (`undefined` unsets). */
  env?: Record<string, string | undefined>;
  clock?: TestClock;
  /** Replaces `process.exit` for the DB connection watcher (default: no-op). */
  processExit?: ProcessExit;
  /** Extra modules next to `AppModule` (e.g. a probe controller). */
  imports?: ModuleMetadata['imports'];
  /** Further provider overrides on the testing module. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** `configureApp` options (e.g. a SPA `staticRoot`). */
  setup?: SetupOptions;
}

export interface TestApp {
  app: NestExpressApplication;
  moduleRef: TestingModule;
  config: AppConfig;
  clock: TestClock;
  /** Mailpit the app's SMTP settings point at. */
  mail: { apiUrl: string; smtpHost: string; smtpPort: number };
  /** Database name from `MONGO_URL`. */
  dbName: string;
  /** `supertest(app.getHttpServer())`. */
  request: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * TST-02 app factory: the full `AppModule.forRoot(config)` with the same
 * HTTP setup as `main.ts` (`configureApp`), against `mongoUrl`, with
 * - clock → `TestClock`,
 * - SMTP → the run's Mailpit,
 * - `PROCESS_EXIT` → no-op (a lost DB must not kill the test worker),
 * - Google verifier → `FakeGoogleVerifier`, selected by
 *   `AUTH_GOOGLE_VERIFIER=fake` in `TEST_ENV` (sign tokens with
 *   `makeIdToken`, or log in with `loginAs`).
 */
export async function createTestApp(
  mongoUrl: string,
  options: TestAppOptions = {},
): Promise<TestApp> {
  const mail = mailpitEndpoints();
  const config = loadConfig({
    ...TEST_ENV,
    MONGO_URL: mongoUrl,
    SMTP_HOST: mail.smtpHost,
    SMTP_PORT: String(mail.smtpPort),
    ...options.env,
  });
  const clock = options.clock ?? new TestClock();

  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config), ...(options.imports ?? [])],
  })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(PROCESS_EXIT)
    .useValue(options.processExit ?? (() => undefined));
  if (options.override) builder = options.override(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app, config, options.setup);
  await app.init();

  return {
    app,
    moduleRef,
    config,
    clock,
    mail,
    dbName: new URL(mongoUrl).pathname.slice(1),
    request: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/**
 * Drops the app's database, then closes the app even when the drop fails
 * (e.g. the DB is gone), so the worker does not hang on open handles.
 */
export async function dropAndClose(app: NestExpressApplication): Promise<void> {
  try {
    await app.get<Connection>(getConnectionToken()).dropDatabase();
  } finally {
    await app.close();
  }
}

/**
 * `createTestApp` in `beforeAll` on its own `test_<random>` database,
 * closed and dropped in `afterAll`. Call at describe/file level.
 */
export function useTestApp(options: TestAppOptions = {}): () => TestApp {
  const dbName = testDatabaseName();
  let testApp: TestApp | undefined;

  beforeAll(async () => {
    testApp = await createTestApp(databaseUrl(dbName), options);
  });

  afterAll(async () => {
    if (!testApp) return;
    const { app } = testApp;
    testApp = undefined;
    await dropAndClose(app);
  });

  return () => {
    if (!testApp) throw new Error('useTestApp: used outside a test');
    return testApp;
  };
}
