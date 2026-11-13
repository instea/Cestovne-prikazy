import type { Finding, MigrationResult, Severity } from './legacy-mapping';

/** MIG-01 exit codes. */
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_REFUSED = 2;
export const EXIT_HAS_ERRORS = 3;

export interface MigrationReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  timezone: string;
  source: { users: number; leaves: number };
  migrated: { users: number; placeholderUsers: number; leaves: number };
  skipped: { users: number; leaves: number };
  droppedFields: { degreesNonEmpty: number; addressNonEmpty: number };
  findingsByCode: Record<string, number>;
  findings: Finding[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function buildReport(
  result: MigrationResult,
  meta: {
    startedAt: Date;
    finishedAt: Date;
    dryRun: boolean;
    timezone: string;
  },
): MigrationReport {
  const findingsByCode: Record<string, number> = {};
  for (const f of result.findings)
    findingsByCode[f.code] = (findingsByCode[f.code] ?? 0) + 1;
  return {
    startedAt: meta.startedAt.toISOString(),
    finishedAt: meta.finishedAt.toISOString(),
    dryRun: meta.dryRun,
    timezone: meta.timezone,
    source: result.source,
    migrated: {
      users: result.users.length - result.placeholderUserIds.length,
      placeholderUsers: result.placeholderUserIds.length,
      leaves: result.leaves.length,
    },
    skipped: result.skipped,
    droppedFields: result.droppedFields,
    findingsByCode,
    findings: result.findings,
  };
}

/** `3` when any record was skipped for an error, else `0`. */
export function exitCodeFor(report: Pick<MigrationReport, 'findings'>): number {
  return report.findings.some((f) => f.severity === 'error')
    ? EXIT_HAS_ERRORS
    : EXIT_OK;
}

const EMAIL = /[^\s@"',{}[\]]+@[^\s@"',{}[\]]+/g;
const PII_KEYS = new Set(['email', 'firstName', 'surname']);

/** Details without personal data: name/email keys dropped, emails masked. */
export function redactDetails(details: Record<string, unknown> | null): string {
  if (details === null) return '';
  const json = JSON.stringify(details, (key, value: unknown) =>
    PII_KEYS.has(key) ? '[redacted]' : value,
  );
  return json.replace(EMAIL, '[email]');
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Human summary; no emails or names (placeholder ids only). */
export function renderMarkdown(report: MigrationReport): string {
  const lines = [
    '# Legacy migration report (MIG-01)',
    '',
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    `- Timezone: ${report.timezone}`,
    '',
    '| | Users | Leaves |',
    '|---|---|---|',
    `| Source | ${report.source.users} | ${report.source.leaves} |`,
    `| Migrated | ${report.migrated.users} (+${report.migrated.placeholderUsers} placeholders) | ${report.migrated.leaves} |`,
    `| Skipped | ${report.skipped.users} | ${report.skipped.leaves} |`,
    '',
    `Dropped fields: degrees non-empty ${report.droppedFields.degreesNonEmpty}, address non-empty ${report.droppedFields.addressNonEmpty}.`,
    '',
  ];

  const groups = new Map<string, Finding[]>();
  for (const f of report.findings) {
    const list = groups.get(f.code) ?? [];
    list.push(f);
    groups.set(f.code, list);
  }
  const ordered = [...groups.entries()].sort(([codeA, a], [codeB, b]) => {
    const sa = Math.min(...a.map((f) => SEVERITY_ORDER[f.severity]));
    const sb = Math.min(...b.map((f) => SEVERITY_ORDER[f.severity]));
    return sa - sb || codeA.localeCompare(codeB);
  });

  if (ordered.length === 0) lines.push('No findings.', '');
  for (const [code, list] of ordered) {
    lines.push(
      `## ${code} (${list[0]!.severity}, ${list.length})`,
      '',
      '| recordId | collection | action | message | details |',
      '|---|---|---|---|---|',
    );
    for (const f of list) {
      lines.push(
        `| ${cell(f.recordId ?? f.sourceObjectId ?? '–')} | ${f.collection} | ${f.action} | ${cell(f.message)} | ${cell(redactDetails(f.details))} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** Decision template for MIG-02: every error and warning, one row each. */
export function renderDecisionsCsv(report: MigrationReport): string {
  const rows = report.findings
    .filter((f) => f.severity !== 'info')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((f) =>
      [f.code, f.recordId ?? f.sourceObjectId ?? '', '', '', '']
        .map(csvField)
        .join(','),
    );
  return ['code,recordId,decision,decidedBy,note', ...rows].join('\n') + '\n';
}
