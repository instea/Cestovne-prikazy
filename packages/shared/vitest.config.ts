import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  resolve: { alias: sharedSourceAlias },
  test: {
    name: 'shared',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
