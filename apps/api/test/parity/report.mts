/**
 * MIG-03 report: `parity-report.json` (everything) and `parity-report.md`
 * (per-request status table, every diff path with its class, unmatched mock
 * requests, timings; attendance and leave list) in the report directory
 * (default `parity-report/`, git-ignored).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APPROVED_CHANGES, type DiffClass } from './classify.mts';
import type { Diff } from './compare.mts';
import type { ParityResult } from './harness.mts';
import type { ListResult } from './list-harness.mts';
import type { ScenarioResult } from './scenario-harness.mts';

/** `#24, #25` for a class, `–` for UNEXPLAINED. */
const approvedChanges = (cls: string): string =>
  Object.hasOwn(APPROVED_CHANGES, cls)
    ? APPROVED_CHANGES[cls as DiffClass].map((n) => `#${n}`).join(', ')
    : '–';

export interface ReportMeta {
  startedAt: string;
  finishedAt: string;
  dataset: 'synthetic' | 'recorded';
  oldImage: string;
  newImage: string;
  timezone: string;
  /** MIG-03 / MIG-04: confirmation that the M2M consumer calls server-side. */
  consumerServerSide: { confirmed: boolean; by: string | null };
  /** Context used by the classifier (for review). */
  context: {
    holidayMismatch: string[];
    hangMonths: string[];
    longLeaveUsers: string[];
    migrationReportedUsers: string[];
  };
  migrationReport: string | null;
}

export interface Report extends ReportMeta {
  passed: boolean;
  /** Attendance requests per status. */
  counts: Record<string, number>;
  /** Leave-list requests per status. */
  listCounts: Record<string, number>;
  /** Write-scenario steps per status. */
  scenarioCounts: Record<string, number>;
  /** Diffs per class, both suites. */
  classCounts: Record<string, number>;
  result: ParityResult;
  /** Leave-list parity; `null` when not run. */
  list: ListResult | null;
  /** Write scenarios; `null` when not run. */
  scenarios: ScenarioResult | null;
}

const emptyCounts = (): Record<string, number> => ({
  EQUAL: 0,
  EXPECTED_DIFF: 0,
  DIFF: 0,
  ERROR: 0,
});

export function buildReport(
  meta: ReportMeta,
  result: ParityResult,
  list: ListResult | null = null,
  scenarios: ScenarioResult | null = null,
): Report {
  const counts = emptyCounts();
  const listCounts = emptyCounts();
  const scenarioCounts = emptyCounts();
  const classCounts: Record<string, number> = {};
  const count = (diffs: readonly Diff[]) => {
    for (const d of diffs) {
      const k = d.class ?? 'UNEXPLAINED';
      classCounts[k] = (classCounts[k] ?? 0) + 1;
    }
  };
  for (const e of result.entries) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
    count([...e.diffs, ...e.notes]);
  }
  for (const e of list?.entries ?? []) {
    listCounts[e.status] = (listCounts[e.status] ?? 0) + 1;
    count(e.diffs);
  }
  for (const e of scenarios?.entries ?? []) {
    scenarioCounts[e.status] = (scenarioCounts[e.status] ?? 0) + 1;
    count(e.diffs);
  }
  const passed =
    result.passed &&
    (list === null || list.passed) &&
    (scenarios === null || scenarios.passed);
  return {
    ...meta,
    passed,
    counts,
    listCounts,
    scenarioCounts,
    classCounts,
    result,
    list,
    scenarios,
  };
}

const short = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === undefined) return '–';
  const t = s.length > 160 ? `${s.slice(0, 160)}…` : s;
  return t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
};

const diffRow = (d: Diff) =>
  `| \`${d.path}\` | ${d.kind} | ${short(d.old)} | ${short(d.new)} | ${d.class ?? '**unexplained**'} |`;

export function renderMarkdown(r: Report): string {
  const lines: string[] = [
    `# Parity report (MIG-03)`,
    ``,
    `**Result: ${r.passed ? 'PASSED' : 'FAILED'}**`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Started | ${r.startedAt} |`,
    `| Finished | ${r.finishedAt} |`,
    `| Dataset | ${r.dataset} |`,
    `| Old image | \`${r.oldImage}\` |`,
    `| New image | \`${r.newImage}\` |`,
    `| Timezone | ${r.timezone} |`,
    `| Migration report | ${r.migrationReport ?? '–'} |`,
    `| M2M consumer calls server-side | ${r.consumerServerSide.confirmed ? `confirmed by ${r.consumerServerSide.by}` : '**not confirmed**'} |`,
    ``,
    `## Summary`,
    ``,
    `| Status | Attendance requests | Leave-list requests | Scenario steps |`,
    `|---|---|---|---|`,
    ...Object.entries(r.counts).map(
      ([k, v]) =>
        `| ${k} | ${r.result.entries.length ? v : '–'} | ${r.list ? (r.listCounts[k] ?? 0) : '–'} | ${r.scenarios ? (r.scenarioCounts[k] ?? 0) : '–'} |`,
    ),
    ``,
    `| Diff class | Diffs | Approved change (functional spec §10) |`,
    `|---|---|---|`,
    ...Object.entries(r.classCounts)
      .sort()
      .map(([k, v]) => `| ${k} | ${v} | ${approvedChanges(k)} |`),
    ``,
    `Classifier context: ${r.context.holidayMismatch.length} holiday-mismatch dates` +
      ` (${r.context.holidayMismatch.join(', ') || 'none'}); hang months: ` +
      `${r.context.hangMonths.join(', ') || 'none'}; long-leave users: ` +
      `${r.context.longLeaveUsers.join(', ') || 'none'}; migration-reported users: ` +
      `${r.context.migrationReportedUsers.join(', ') || 'none'}.`,
    ``,
    `## Attendance requests`,
    ``,
    `| Request | Status | Old | New | Diffs |`,
    `|---|---|---|---|---|`,
  ];
  for (const e of r.result.entries) {
    const app = (s: typeof e.old) =>
      `${s.status ?? s.outcome} (${s.ms} ms, ${s.requests} out)`;
    lines.push(
      `| ${e.request.year}/${e.request.month} | ${e.status}${e.orderOnly ? ' (order-only)' : ''} | ${app(e.old)} | ${app(e.new)} | ${e.diffs.length} |`,
    );
  }
  if (r.result.unmatched.length > 0) {
    lines.push(``, `## Unmatched mock requests`, ``);
    for (const u of r.result.unmatched)
      lines.push(
        `- ${u.app} ${u.method} ${u.path} \`${short(u.body)}\`${u.reason ? ` (${u.reason}, HTTP ${u.status})` : ''}`,
      );
  }
  if (r.result.nothingCompared.length > 0) {
    lines.push(
      ``,
      `## Nothing compared`,
      ``,
      `No mock request got a 2xx answer for: ${r.result.nothingCompared.join(', ')}. ` +
        `The apps never reached SSO / Toggl successfully, so equal responses prove nothing.`,
    );
  }
  const withDiffs = r.result.entries.filter(
    (e) => e.diffs.length > 0 || e.error,
  );
  if (withDiffs.length > 0) {
    lines.push(``, `## Diffs`);
    for (const e of withDiffs) {
      lines.push(
        ``,
        `### ${e.request.year}/${e.request.month}: ${e.status}${e.orderOnly ? ' (order-only)' : ''}`,
        ``,
      );
      if (e.error) lines.push(`Error: ${e.error}`, ``);
      if (e.diffs.length > 0)
        lines.push(
          `| Path | Kind | Old | New | Class |`,
          `|---|---|---|---|---|`,
          ...e.diffs.map(diffRow),
        );
    }
  }
  if (r.list) lines.push(...renderList(r.list));
  if (r.scenarios) lines.push(...renderScenarios(r.scenarios));
  const cors = r.result.entries.filter((e) => e.notes.length > 0).length;
  lines.push(
    ``,
    `## Header notes`,
    ``,
    `CORS_HEADERS: ${cors} responses differ only in \`Access-Control-Allow-Origin\` (old \`*\`, new none); not part of the status.`,
    ``,
  );
  return lines.join('\n');
}

function renderList(list: ListResult): string[] {
  const app = (s: ListResult['entries'][number]['old']) =>
    `${s.status ?? s.outcome}${s.leaves === null ? '' : `, ${s.leaves} leaves`} (${s.ms} ms)`;
  const lines = [
    ``,
    `## Leave-list requests`,
    ``,
    `Old GraphQL \`getLeaves\` vs new \`GET /api/leaves\`, both reduced to the old client's leave model.`,
    ``,
    `| Request | Status | Old | New | Diffs |`,
    `|---|---|---|---|---|`,
    ...list.entries.map(
      (e) =>
        `| ${e.request.label} | ${e.status} | ${app(e.old)} | ${app(e.new)} | ${e.diffs.length} |`,
    ),
  ];
  const withDiffs = list.entries.filter((e) => e.diffs.length > 0 || e.error);
  if (withDiffs.length > 0) {
    lines.push(``, `## Leave-list diffs`);
    for (const e of withDiffs) {
      lines.push(``, `### ${e.request.label}: ${e.status}`, ``);
      if (e.error) lines.push(`Error: ${e.error}`, ``);
      if (e.diffs.length > 0)
        lines.push(
          `| Path | Kind | Old | New | Class |`,
          `|---|---|---|---|---|`,
          ...e.diffs.map(diffRow),
        );
    }
  }
  return lines;
}

function renderScenarios(s: ScenarioResult): string[] {
  const lines = [
    ``,
    `## Write scenarios`,
    ``,
    `Each step on both apps; then the answers, the emails sent and the whole leave list are compared.`,
    ``,
    `| Step | Actor | Status | Old | New | Emails old / new | Diffs |`,
    `|---|---|---|---|---|---|---|`,
    ...s.entries.map(
      (e) =>
        `| ${e.step} | ${e.actor ?? '–'} | ${e.status} | ${short(e.old)} | ${short(e.new)} | ${e.mails.old} / ${e.mails.new} | ${e.diffs.length} |`,
    ),
  ];
  const withDiffs = s.entries.filter((e) => e.diffs.length > 0 || e.error);
  if (withDiffs.length > 0) {
    lines.push(``, `## Write-scenario diffs`);
    for (const e of withDiffs) {
      lines.push(``, `### ${e.step}: ${e.status}`, ``);
      if (e.error) lines.push(`Error: ${e.error}`, ``);
      if (e.diffs.length > 0)
        lines.push(
          `| Path | Kind | Old | New | Class |`,
          `|---|---|---|---|---|`,
          ...e.diffs.map(diffRow),
        );
    }
  }
  return lines;
}

export async function writeReport(dir: string, r: Report): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const json = join(dir, 'parity-report.json');
  const md = join(dir, 'parity-report.md');
  await writeFile(json, `${JSON.stringify(r, null, 2)}\n`);
  await writeFile(md, renderMarkdown(r));
  return [json, md];
}
