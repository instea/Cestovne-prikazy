import { defineProject } from 'vitest/config';
import { sharedSourceAlias } from '../../vitest.shared.js';

export default defineProject({
  resolve: { alias: sharedSourceAlias },
  test: {
    name: 'api-unit',
    environment: 'node',
    // MIG-03: the parity harness's pure modules have unit tests next to them.
    // NFR-05: static manifest lint (test/ops/*.spec.ts, no containers).
    // DOC-03: README env table vs config schema (test/readme-env.spec.ts).
    include: [
      'test/readme-env.spec.ts',
      'src/**/*.spec.ts',
      'test/parity/**/*.spec.ts',
      'test/ops/**/*.spec.ts',
    ],
    exclude: ['src/**/*.int-spec.ts'],
  },
});
