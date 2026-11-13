import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  resolve: { alias: sharedSourceAlias },
  test: {
    name: 'api-integration',
    environment: 'node',
    include: ['src/**/*.int-spec.ts', 'test/**/*.int-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    hookTimeout: 120_000,
  },
});
