import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'apps/api/vitest.config.mts',
      'apps/api/vitest.integration.config.mts',
      'apps/web/vitest.config.ts',
    ],
  },
});
