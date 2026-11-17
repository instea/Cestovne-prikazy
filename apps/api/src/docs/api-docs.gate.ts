import type { AppConfig } from '../config/env.schema';

/**
 * NFR-05 target 1: the API explorer (Swagger UI and its JSON) exists only
 * outside production. In production nothing is registered, so both paths
 * fall through to the global 404 `NOT_FOUND` body like any unknown route.
 */
export const API_DOCS_PATH = 'api/docs';
/** OpenAPI JSON path (the `<path>-json` convention of Swagger UI setups). */
export const API_DOCS_JSON_PATH = `${API_DOCS_PATH}-json`;

export function isApiDocsEnabled(config: Pick<AppConfig, 'NODE_ENV'>): boolean {
  return config.NODE_ENV !== 'production';
}
