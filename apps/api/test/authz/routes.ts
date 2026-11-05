import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import type request from 'supertest';

/**
 * TST-02: the app's routes, read from Nest controller metadata (the same
 * decorators Nest registers routes from). Express answers HEAD from every
 * GET route, so each GET also yields a HEAD route.
 * Not covered (none used yet): global prefix, RouterModule paths, versioning.
 * The production SPA fallback (`web/spa.ts`) is not a controller route.
 */

export interface Route {
  method: string;
  path: string;
}

export type RouteKey = `${string} /${string}`;

export const routeKey = (r: Route): RouteKey =>
  `${r.method} ${r.path}` as RouteKey;

function asPaths(value: unknown): string[] {
  if (value === undefined) return [''];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function joinPath(...parts: string[]): string {
  const segments = parts.flatMap((p) => p.split('/')).filter((s) => s !== '');
  return `/${segments.join('/')}`;
}

export function listRoutes(app: INestApplication): Route[] {
  const scanner = new MetadataScanner();
  const seen = new Map<RouteKey, Route>();
  const add = (route: Route) => seen.set(routeKey(route), route);

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as
        (abstract new () => unknown) | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      const prefixes = asPaths(Reflect.getMetadata(PATH_METADATA, controller));
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) continue;
        const verb = RequestMethod[method];
        for (const prefix of prefixes) {
          for (const path of asPaths(
            Reflect.getMetadata(PATH_METADATA, handler),
          )) {
            const full = joinPath(prefix, path);
            add({ method: verb, path: full });
            if (method === RequestMethod.GET)
              add({ method: 'HEAD', path: full });
          }
        }
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

/**
 * Every route needs a matrix row and every row a route. Throws one line per
 * problem: `Route <METHOD> <path> missing from authorization matrix`.
 */
export function assertMatrixCoversRoutes(
  routes: readonly Route[],
  matrix: Readonly<Record<string, unknown>>,
): void {
  const keys = new Set<string>(routes.map(routeKey));
  const problems = [
    ...[...keys]
      .filter((k) => !(k in matrix))
      .map((k) => `Route ${k} missing from authorization matrix`),
    ...Object.keys(matrix)
      .filter((k) => !keys.has(k))
      .map((k) => `Matrix row ${k} matches no route`),
  ];
  if (problems.length > 0) throw new Error(problems.join('\n'));
}

type Agent = ReturnType<typeof request>;

/** Send `method path` with supertest (`ALL` is sent as GET). */
export function send(agent: Agent, method: string, path: string) {
  const verbs = {
    GET: 'get',
    HEAD: 'head',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete',
    OPTIONS: 'options',
    ALL: 'get',
  } as const;
  const verb = verbs[method as keyof typeof verbs];
  if (!verb) throw new Error(`send: unsupported method ${method}`);
  return agent[verb](path);
}
