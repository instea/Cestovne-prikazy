import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../config/env.schema';

/**
 * NFR-05 target 1: the API explorer (Swagger UI and its JSON) exists only
 * outside production. In production nothing is registered, so both paths
 * fall through to the global 404 `NOT_FOUND` body like any unknown route.
 */
export const API_DOCS_PATH = 'api/docs';
/** Swagger JSON path (`SwaggerModule.setup` serves `<path>-json`). */
export const API_DOCS_JSON_PATH = `${API_DOCS_PATH}-json`;

/** Mounts the explorer at `API_DOCS_PATH` / `API_DOCS_JSON_PATH`. */
export type ApiDocsRegistrar = (
  app: NestExpressApplication,
  config: AppConfig,
) => void;

/**
 * TODO(DOC-02): replace with the OpenAPI explorer (document built from the
 * controllers, served at `API_DOCS_PATH` / `API_DOCS_JSON_PATH`). Until then
 * there is no explorer. The docs must be served from a Nest controller with
 * an access declaration (`@Public()`, still gated by `isApiDocsEnabled`),
 * not via `SwaggerModule.setup` / `app.get` / `app.use`: handlers outside
 * controllers skip the guards and the permission matrix, and
 * `test/security/router-stack.int-spec.ts` fails on them. Changing that
 * means updating that test deliberately.
 */
export const registerSwagger: ApiDocsRegistrar = () => undefined;

export function isApiDocsEnabled(config: Pick<AppConfig, 'NODE_ENV'>): boolean {
  return config.NODE_ENV !== 'production';
}

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
