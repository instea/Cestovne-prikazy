import 'reflect-metadata';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../../src/config/config.module';
import { loadConfig } from '../../src/config/env.schema';
import {
  API_DOCS_JSON_PATH,
  API_DOCS_PATH,
  type ApiDocsRegistrar,
} from '../../src/docs/api-docs';
import { LoggingModule } from '../../src/logging/logging.module';
import { SPA_MIDDLEWARE } from '../../src/web/spa';
import { listDeclaredRoutes } from '../authz/routes';
import { useTestApp } from '../support/app';
import { TEST_ENV } from '../support/env';

/**
 * NFR-01 / B9: every request handler of the real app is a Nest controller
 * route (so it has an access declaration the guards and the permission
 * matrix check), except the documented SPA static / fallback middleware
 * (`src/web/spa.ts`). Read from the live Express router stack, so a
 * `SwaggerModule.setup(...)`, `app.get(...)` or `app.use(path, handler)`
 * added outside a controller fails here.
 *
 * Also accepted: what Nest itself mounts in an app without controllers
 * (with the app's `LoggingModule`: pino-http middleware, the 404 and error
 * handlers; compared by code and count) and the CORS middleware of
 * `enableCors` (answers preflights only).
 */

interface Handler {
  name: string;
  handle: (...args: never[]) => unknown;
}
interface Layer extends Handler {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Handler[];
  };
}

const stackOf = (app: NestExpressApplication): Layer[] =>
  (app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }).router
    .stack;

/** Same code (and path) = same framework layer. */
const signature = (l: Layer): string =>
  l.route
    ? `route ${l.route.path} ${l.route.stack.map((h) => String(h.handle)).join(' | ')}`
    : `use ${l.name} ${String(l.handle)}`;

const describeLayer = (l: Layer): string =>
  l.route
    ? `route ${Object.keys(l.route.methods)
        .filter((m) => m !== '_all')
        .map((m) => m.toUpperCase())
        .join(
          ',',
        )} ${l.route.path} (${l.route.stack.map((h) => h.name).join(', ')})`
    : `middleware ${l.name}`;

/** Layers of a Nest app with no controllers (framework + logging only). */
async function frameworkLayers(): Promise<Map<string, number>> {
  const config = loadConfig({ ...TEST_ENV, MONGO_URL: 'mongodb://unused' });
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot(config),
      LoggingModule.forRoot({ write: () => undefined }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  await app.init();
  const counts = new Map<string, number>();
  for (const l of stackOf(app))
    counts.set(signature(l), (counts.get(signature(l)) ?? 0) + 1);
  await app.close();
  return counts;
}

/** Every layer that is neither a controller route nor an accepted one. */
function unexpectedLayers(
  app: NestExpressApplication,
  framework: ReadonlyMap<string, number>,
): string[] {
  const routes = new Map(
    listDeclaredRoutes(app).map((r) => [`${r.method} ${r.path}`, r.handler]),
  );
  const left = new Map(framework);
  const problems: string[] = [];
  for (const layer of stackOf(app)) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(
        (m) => m !== '_all',
      );
      const handlers = methods.map((m) =>
        routes.get(`${m.toUpperCase()} ${layer.route!.path}`),
      );
      const isController =
        handlers.length > 0 &&
        handlers.every(
          (h) =>
            h !== undefined && layer.route!.stack.every((s) => s.name === h),
        );
      if (isController) continue;
    } else if (
      SPA_MIDDLEWARE.has(layer.handle) ||
      layer.name === 'corsMiddleware'
    ) {
      continue;
    }
    const sig = signature(layer);
    const n = left.get(sig) ?? 0;
    if (n > 0) {
      left.set(sig, n - 1);
      continue;
    }
    problems.push(describeLayer(layer));
  }
  return problems;
}

let framework: Map<string, number>;
beforeAll(async () => {
  framework = await frameworkLayers();
});

describe('router stack, production config (SPA from the image path)', () => {
  const ctx = useTestApp({
    env: { NODE_ENV: 'production', AUTH_GOOGLE_VERIFIER: undefined },
  });

  it('has only controller routes, the SPA middleware and framework layers', () => {
    expect(unexpectedLayers(ctx().app, framework)).toEqual([]);
    // The SPA middleware really is mounted (static files + fallback).
    expect(
      stackOf(ctx().app).filter((l) => SPA_MIDDLEWARE.has(l.handle)),
    ).toHaveLength(2);
  });
});

describe('router stack, non-production config (API explorer enabled)', () => {
  const staticRoot = mkdtempSync(join(tmpdir(), 'leaves-spa-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html>');
  afterAll(() => rmSync(staticRoot, { recursive: true, force: true }));
  const ctx = useTestApp({
    env: { NODE_ENV: 'development' },
    setup: { staticRoot },
  });

  it('has only controller routes, the SPA middleware and framework layers', () => {
    expect(unexpectedLayers(ctx().app, framework)).toEqual([]);
  });
});

describe('router stack check catches handlers outside controllers', () => {
  /** What a `SwaggerModule.setup` / ad-hoc route would add. */
  const outsideControllers: ApiDocsRegistrar = (app) => {
    app.use(
      `/${API_DOCS_PATH}`,
      function swaggerUi(_req: Request, res: Response) {
        res.send('ui');
      },
    );
    app.getHttpAdapter().get(`/${API_DOCS_JSON_PATH}`, ((
      _req: Request,
      res: Response,
    ) => {
      res.json({});
    }) as never);
  };
  const ctx = useTestApp({
    env: { NODE_ENV: 'development' },
    setup: { apiDocs: outsideControllers },
  });

  it('names the unguarded route and middleware', () => {
    expect(unexpectedLayers(ctx().app, framework)).toEqual([
      'middleware swaggerUi',
      `route GET /${API_DOCS_JSON_PATH} (<anonymous>)`,
    ]);
  });
});
