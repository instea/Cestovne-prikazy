#!/usr/bin/env node
// TST-03 flakiness gate: reads the Playwright JSON report and writes a
// Markdown summary (passed / failed / flaky = passed only on retry) to
// $GITHUB_STEP_SUMMARY, or stdout without it. Exit code is always 0: the
// test step itself fails the job on real failures.
//
//   node scripts/e2e-flaky-summary.mjs [e2e/reports/results.json]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function summarize(report) {
  const rows = { expected: [], unexpected: [], flaky: [], skipped: [] };
  const walk = (suite, titles) => {
    for (const child of suite.suites ?? []) {
      walk(child, child.title ? [...titles, child.title] : titles);
    }
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const title = [...titles, spec.title].join(' › ');
        (rows[test.status] ?? rows.unexpected).push(`${spec.file}: ${title}`);
      }
    }
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return rows;
}

export function toMarkdown(rows) {
  const lines = [
    '## E2E (Playwright)',
    '',
    `| passed | failed | flaky | skipped |`,
    `| --- | --- | --- | --- |`,
    `| ${rows.expected.length} | ${rows.unexpected.length} | ${rows.flaky.length} | ${rows.skipped.length} |`,
    '',
  ];
  if (rows.flaky.length > 0) {
    lines.push('### Flaky (passed only on retry)', '');
    for (const t of rows.flaky) lines.push(`- ${t}`);
    lines.push('');
  }
  if (rows.unexpected.length > 0) {
    lines.push('### Failed', '');
    for (const t of rows.unexpected) lines.push(`- ${t}`);
    lines.push('');
  }
  return lines.join('\n');
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const file = process.argv[2] ?? 'e2e/reports/results.json';
  if (!existsSync(file)) {
    console.log(`No Playwright report at ${file}`);
    process.exit(0);
  }
  const rows = summarize(JSON.parse(readFileSync(file, 'utf8')));
  const md = toMarkdown(rows);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `flaky=${rows.flaky.length}\n`);
  }
  console.log(md);
  for (const t of rows.flaky)
    console.log(`::warning title=Flaky E2E test::${t}`);
}
