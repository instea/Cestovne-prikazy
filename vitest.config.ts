import { defineConfig } from 'vitest/config';

// TST-01 thresholds. The api threshold applies to unit + integration merged,
// so it is enforced only when both run together (`pnpm test`, COVERAGE_API=1).
const thresholds = {
  'packages/shared/src/**': { lines: 95, branches: 90, functions: 95 },
  'apps/web/src/**': { lines: 75, branches: 65 },
  ...(process.env.COVERAGE_API === '1'
    ? { 'apps/api/src/**': { lines: 85, branches: 80 } }
    : {}),
};

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'apps/api/vitest.config.mts',
      'apps/api/vitest.integration.config.mts',
      'apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/main.ts',
        '**/main.tsx',
        '**/*.module.ts',
        '**/*.d.ts',
        '**/*.spec.{ts,tsx}',
        '**/*.int-spec.ts',
        '**/generated/**',
        '**/test/**',
        '**/testing/**',
      ],
      thresholds,
    },
  },
});
