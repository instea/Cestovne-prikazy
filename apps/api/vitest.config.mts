import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  resolve: { alias: sharedSourceAlias },
  test: {
    name: 'api-unit',
    environment: 'node',
    // MIG-03: the parity harness's pure modules have unit tests next to them.
    // NFR-05: static manifest lint (test/ops/*.spec.ts, no containers).
    include: [
      'src/**/*.spec.ts',
      'test/parity/**/*.spec.ts',
      'test/ops/**/*.spec.ts',
    ],
    exclude: ['src/**/*.int-spec.ts'],
  },
});
