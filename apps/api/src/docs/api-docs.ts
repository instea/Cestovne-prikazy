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
 * TODO(DOC-02): replace with the `SwaggerModule` setup (document from the
 * controllers, served at `API_DOCS_PATH`). Until then there is no explorer.
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
