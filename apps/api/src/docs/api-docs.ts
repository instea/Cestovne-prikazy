import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../config/env.schema';
import { ApiDocsStore } from './api-docs.controller';
import { isApiDocsEnabled } from './api-docs.gate';
import { buildOpenApiDocument } from './openapi';

export {
  API_DOCS_JSON_PATH,
  API_DOCS_PATH,
  isApiDocsEnabled,
} from './api-docs.gate';

/** Mounts the explorer at `API_DOCS_PATH` / `API_DOCS_JSON_PATH`. */
export type ApiDocsRegistrar = (
  app: NestExpressApplication,
  config: AppConfig,
) => void;

/**
 * DOC-02: hands the OpenAPI document of `app` (built on first request) to
 * the explorer controller (`ApiDocsController` in `ApiDocsModule`, part of
 * `AppModule` and registered only when `isApiDocsEnabled`). It mounts
 * nothing itself: the docs are served from that controller with `@Public()`,
 * not via `SwaggerModule.setup` / `app.get` / `app.use`, because handlers
 * outside controllers skip the guards and the permission matrix, and
 * `test/security/router-stack.int-spec.ts` fails on them.
 */
export const registerSwagger: ApiDocsRegistrar = (app) => {
  let store: ApiDocsStore;
  try {
    store = app.get(ApiDocsStore);
  } catch {
    // An app without `ApiDocsModule` (test probe modules): no explorer.
    return;
  }
  store.use(() => buildOpenApiDocument(app));
};

/**
 * The single gate for the API explorer: `register` runs only when
 * `isApiDocsEnabled`. Returns whether it ran.
 */
export function registerApiDocs(
  app: NestExpressApplication,
  config: AppConfig,
  register: ApiDocsRegistrar = registerSwagger,
): boolean {
  if (!isApiDocsEnabled(config)) return false;
  register(app, config);
  return true;
}
