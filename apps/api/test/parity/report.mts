/**
 * MIG-03 report: `parity-report.json` (everything) and `parity-report.md`
 * (per-request status table, every diff path with its class, unmatched mock
 * requests, timings) in the report directory (default `parity-report/`,
 * git-ignored).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diff } from './compare.mts';
import type { ParityResult } from './harness.mts';

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
  counts: Record<string, number>;
  classCounts: Record<string, number>;
  result: ParityResult;
}

export function buildReport(meta: ReportMeta, result: ParityResult): Report {
  const counts: Record<string, number> = {
    EQUAL: 0,
    EXPECTED_DIFF: 0,
    DIFF: 0,
    ERROR: 0,
  };
  const classCounts: Record<string, number> = {};
  for (const e of result.entries) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
    for (const d of [...e.diffs, ...e.notes]) {
      const k = d.class ?? 'UNEXPLAINED';
      classCounts[k] = (classCounts[k] ?? 0) + 1;
    }
  }
  return { ...meta, passed: result.passed, counts, classCounts, result };
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
    `# Attendance parity report (MIG-03)`,
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
    `| Status | Requests |`,
    `|---|---|`,
    ...Object.entries(r.counts).map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `| Diff class | Diffs |`,
    `|---|---|`,
    ...Object.entries(r.classCounts)
      .sort()
      .map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `Classifier context: ${r.context.holidayMismatch.length} holiday-mismatch dates` +
      ` (${r.context.holidayMismatch.join(', ') || 'none'}); hang months: ` +
      `${r.context.hangMonths.join(', ') || 'none'}; long-leave users: ` +
      `${r.context.longLeaveUsers.join(', ') || 'none'}; migration-reported users: ` +
      `${r.context.migrationReportedUsers.join(', ') || 'none'}.`,
    ``,
    `## Requests`,
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

export async function writeReport(dir: string, r: Report): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const json = join(dir, 'parity-report.json');
  const md = join(dir, 'parity-report.md');
  await writeFile(json, `${JSON.stringify(r, null, 2)}\n`);
  await writeFile(md, renderMarkdown(r));
  return [json, md];
}
