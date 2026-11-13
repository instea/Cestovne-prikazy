import { describe, expect, it } from 'vitest';
import { summarize, toMarkdown } from './e2e-flaky-summary.mjs';

// TST-03: the CI job summary lists tests that passed only on retry.
const report = {
  suites: [
    {
      title: 'login.spec.ts',
      specs: [
        { title: 'ok', file: 'login.spec.ts', tests: [{ status: 'expected' }] },
        { title: 'retry', file: 'login.spec.ts', tests: [{ status: 'flaky' }] },
      ],
      suites: [
        {
          title: 'session',
          specs: [
            {
              title: 'broken',
              file: 'login.spec.ts',
              tests: [{ status: 'unexpected' }],
            },
          ],
        },
      ],
    },
  ],
};

describe('e2e flaky summary', () => {
  it('groups tests by final status', () => {
    const rows = summarize(report);
    expect(rows.expected).toEqual(['login.spec.ts: ok']);
    expect(rows.flaky).toEqual(['login.spec.ts: retry']);
    expect(rows.unexpected).toEqual(['login.spec.ts: session › broken']);
  });

  it('renders counts and the flaky list', () => {
    const md = toMarkdown(summarize(report));
    expect(md).toContain('| 1 | 1 | 1 | 0 |');
    expect(md).toContain('### Flaky (passed only on retry)');
    expect(md).toContain('- login.spec.ts: retry');
  });
});
