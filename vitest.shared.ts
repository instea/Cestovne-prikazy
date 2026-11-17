import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(
  new URL('./packages/shared/src', import.meta.url),
);

/**
 * Resolve `@leaves/shared` (and its subpaths) to TypeScript source in Vite
 * and Vitest, so tests and the dev server never need a prior build.
 */
export const sharedSourceAlias = [
  { find: /^@leaves\/shared$/, replacement: `${sharedSrc}/index.ts` },
  { find: /^@leaves\/shared\/(.+)$/, replacement: `${sharedSrc}/$1.ts` },
];
