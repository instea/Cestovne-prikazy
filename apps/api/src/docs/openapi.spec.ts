import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import { ApiDocsStore, swaggerUiPage } from './api-docs.controller';
import { isApiDocsEnabled } from './api-docs.gate';
import { normalizeDocument, serializeOpenApi } from './openapi';

const op = (responses: Record<string, unknown>) => ({ responses }) as never;

describe('normalizeDocument (DOC-02 stable key order)', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1', contact: {} },
    paths: {
      '/b': { post: op({ '500': {}, '201': {}, '400': {} }), get: op({}) },
      '/a': { delete: op({}), head: op({}) },
    },
    components: {
      schemas: { Zed: {}, Alpha: {} },
      securitySchemes: { m2mBasic: {}, bearer: {} },
    },
  } as unknown as OpenAPIObject;

  it('sorts paths, schemas, schemes and responses; orders methods', () => {
    const out = normalizeDocument(doc);
    expect(Object.keys(out.paths)).toEqual(['/a', '/b']);
    expect(Object.keys(out.paths['/a']!)).toEqual(['head', 'delete']);
    expect(Object.keys(out.paths['/b']!)).toEqual(['get', 'post']);
    expect(Object.keys(out.paths['/b']!.post!.responses)).toEqual([
      '201',
      '400',
      '500',
    ]);
    expect(Object.keys(out.components!.schemas!)).toEqual(['Alpha', 'Zed']);
    expect(Object.keys(out.components!.securitySchemes!)).toEqual([
      'bearer',
      'm2mBasic',
    ]);
  });

  it('serializes deterministically (2 spaces, final newline, no empty contact)', () => {
    const a = serializeOpenApi(normalizeDocument(doc));
    expect(a).toBe(serializeOpenApi(normalizeDocument(doc)));
    expect(a.endsWith('}\n')).toBe(true);
    expect(a).not.toContain('contact');
    expect(a.split('\n')[1]).toBe('  "openapi": "3.1.0",');
  });
});

describe('Swagger UI page', () => {
  it('uses URLs relative to /api/docs', () => {
    const html = swaggerUiPage(false);
    expect(html).toContain('href="docs/swagger-ui.css"');
    expect(html).toContain('src="docs/swagger-initializer.js"');
    expect(html).toContain('data-url="docs-json"');
    expect(html).not.toMatch(/<script>/);
  });

  it('uses URLs relative to /api/docs/', () => {
    const html = swaggerUiPage(true);
    expect(html).toContain('href="swagger-ui.css"');
    expect(html).toContain('data-url="../docs-json"');
  });
});

describe('ApiDocsStore', () => {
  it('is 404 NOT_FOUND until a document builder is registered', () => {
    const store = new ApiDocsStore();
    expect(() => store.get()).toThrow(AppException);
  });

  it('builds the document once', () => {
    const store = new ApiDocsStore();
    let builds = 0;
    store.use(() => {
      builds++;
      return { openapi: '3.1.0' } as OpenAPIObject;
    });
    expect(store.get()).toBe(store.get());
    expect(builds).toBe(1);
  });
});

describe('isApiDocsEnabled (NFR-05)', () => {
  it.each([
    ['production', false],
    ['development', true],
    ['test', true],
  ] as const)('%s → %s', (NODE_ENV, enabled) => {
    expect(isApiDocsEnabled({ NODE_ENV })).toBe(enabled);
  });
});
