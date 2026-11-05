import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  resolve: { alias: sharedSourceAlias },
  test: {
    name: 'api-unit',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.int-spec.ts'],
  },
});
