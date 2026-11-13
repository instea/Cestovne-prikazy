// Validation methodology, part 1: every user story of the rewrite spec is
// the oracle and must be proven by at least one test. Drift checks of
// docs/traceability-matrix.md against PROJECT_REWRITE_SPEC.md §2 and the
// cited test files.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFile, ROOT } from './check-md-links.mjs';

const MATRIX = resolve(ROOT, 'docs/traceability-matrix.md');
const SPEC = resolve(ROOT, 'docs/tech-rewrite/PROJECT_REWRITE_SPEC.md');

/**
 * The user stories of §2 "Features by area": every top-level bullet except
 * "Out of scope (removed)", without the trailing source references
 * `(analysis: …)` / `(interview: …)` / `(client …)`.
 */
export function specStories(markdown) {
  const start = markdown.indexOf('\n## 2. ');
  const end = markdown.indexOf('\n## ', start + 1);
  const stories = [];
  let area = null;
  for (const line of markdown.slice(start, end).split('\n')) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) area = heading[1].trim();
    const bullet = /^- (.+)$/.exec(line);
    if (!bullet || area === null || area.startsWith('Out of scope')) continue;
    stories.push({
      area,
      text: bullet[1]
        .replace(/\s*\((?:analysis|interview|client)[^()]*\)\s*$/, '')
        .trim(),
    });
  }
  return stories;
}

const LEVELS = ['Unit', 'Integration', 'E2E', 'Parity'];

/** Story sections of the matrix: id, quoted story, cited tests per level. */
export function matrixStories(markdown) {
  const sections = markdown.split(/^### /m).slice(1);
  return sections
    .filter((s) => /^US-\d+\n/.test(s))
    .map((section) => {
      const [id] = section.split('\n', 1);
      const quote = /^> (.+)$/m.exec(section)?.[1].trim() ?? null;
      const tests = Object.fromEntries(LEVELS.map((l) => [l, []]));
      let level = null;
      for (const line of section.split('\n')) {
        const top = /^- (Unit|Integration|E2E|Parity)$/.exec(line);
        if (top) {
          level = top[1];
          continue;
        }
        if (/^\S/.test(line)) level = null;
        const item =
          /^ {2}- \[`?([^\]`]+)`?\]\(\.\.\/([^)#\s]+)[^)]*\)(?: › (.+))?/.exec(
            line,
          );
        if (level && item) {
          const title = item[3]
            ? item[3].trim().replace(/^(`+) ?(.*?) ?\1$/, '$2')
            : null;
          tests[level].push({ file: item[2], title });
        }
      }
      return { id, quote, tests };
    });
}

/** Summary table rows: id → set of levels marked ✓. */
export function summaryRows(markdown) {
  const rows = new Map();
  const start = markdown.indexOf('\n## Summary\n');
  const summary = markdown.slice(start, markdown.indexOf('\n## ', start + 1));
  for (const m of summary.matchAll(
    /^\| \[(US-\d+)\]\(#us-\d+\) \|([^\n]+)\|$/gm,
  )) {
    const cells = m[2].split('|').map((c) => c.trim());
    rows.set(m[1], new Set(LEVELS.filter((_, i) => cells[i] === '✓')));
  }
  return rows;
}

/** Whether `title` is a whole string literal (any quote style) in `source`. */
export function hasTitle(source, title) {
  const variants = [
    `'${title.replace(/'/g, "\\'")}'`,
    `"${title.replace(/"/g, '\\"')}"`,
    `\`${title}\``,
  ];
  return variants.some((v) => source.includes(v));
}

const LEVEL_FILE = {
  Unit: /^(?!e2e\/)[\w./-]+\.spec\.(?:tsx?|mjs)$/,
  Integration: /^apps\/api\/test\/[\w./-]+\.int-spec\.ts$/,
  E2E: /^e2e\/specs\/[\w.-]+\.spec\.ts$/,
  Parity: /^apps\/api\/test\/parity\//,
};

const matrix = readFileSync(MATRIX, 'utf8');
const stories = matrixStories(matrix);

describe('docs/traceability-matrix.md', () => {
  it('has no broken relative links or anchors', () => {
    expect(checkFile(MATRIX)).toEqual([]);
  });

  it('quotes every §2 user story exactly once, and nothing else', () => {
    const spec = specStories(readFileSync(SPEC, 'utf8')).map((s) => s.text);
    const quoted = stories.map((s) => s.quote);
    expect(spec.length).toBeGreaterThan(40);
    expect([...quoted].sort()).toEqual([...spec].sort());
  });

  it('numbers the stories US-01, US-02, … in order', () => {
    expect(stories.map((s) => s.id)).toEqual(
      stories.map((_, i) => `US-${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('proves every story with at least one test', () => {
    const untested = stories
      .filter((s) => LEVELS.every((l) => s.tests[l].length === 0))
      .map((s) => s.id);
    expect(untested).toEqual([]);
  });

  it('cites existing files at the right level, and test titles that occur in them', () => {
    const problems = [];
    for (const s of stories) {
      for (const level of LEVELS) {
        for (const { file, title } of s.tests[level]) {
          if (!LEVEL_FILE[level].test(file))
            problems.push(`${s.id} ${level}: ${file} is not a ${level} file`);
          if (!existsSync(resolve(ROOT, file))) {
            problems.push(`${s.id} ${level}: ${file} does not exist`);
            continue;
          }
          if (level === 'Parity') continue;
          if (!title) {
            problems.push(`${s.id} ${level}: ${file} cites no test title`);
          } else if (
            !hasTitle(readFileSync(resolve(ROOT, file), 'utf8'), title)
          ) {
            problems.push(`${s.id} ${level}: "${title}" not found in ${file}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('has a summary row per story that matches its sections', () => {
    const rows = summaryRows(matrix);
    expect([...rows.keys()]).toEqual(stories.map((s) => s.id));
    for (const s of stories) {
      const actual = new Set(LEVELS.filter((l) => s.tests[l].length > 0));
      expect([...rows.get(s.id)], s.id).toEqual([...actual]);
    }
  });
});

describe('traceability helpers', () => {
  it('strips the source references of a spec bullet', () => {
    const md = [
      '## 2. Features by area',
      '### Out of scope (removed)',
      '- Trips (analysis: §2.1)',
      '### Leave summary',
      '- Summary counts only APPROVED leaves (analysis: §2.6; interview: Leave rules)',
      '## 3. Next',
    ].join('\n');
    expect(specStories(`\n${md}`)).toEqual([
      { area: 'Leave summary', text: 'Summary counts only APPROVED leaves' },
    ]);
  });

  it('finds a title in any quote style, escaped quotes included', () => {
    const src = `it("another user's leave", f); test('say \\'hi\\'', g); it(\`x \${y}\`, h)`;
    expect(hasTitle(src, "another user's leave")).toBe(true);
    expect(hasTitle(src, "say 'hi'")).toBe(true);
    expect(hasTitle(src, 'x ${y}')).toBe(true);
    expect(hasTitle(src, 'another user')).toBe(false);
  });

  it('reads levels, files and code-span titles of a story section', () => {
    const md = [
      '### US-01',
      '',
      '> A story',
      '',
      '- Unit',
      '  - [`a.spec.ts`](../a.spec.ts) › ``has `code` inside``',
      '- Parity',
      '  - [MIG-03](../apps/api/test/parity/README.md): text',
      '',
      'Note.',
    ].join('\n');
    expect(matrixStories(md)).toEqual([
      {
        id: 'US-01',
        quote: 'A story',
        tests: {
          Unit: [{ file: 'a.spec.ts', title: 'has `code` inside' }],
          Integration: [],
          E2E: [],
          Parity: [{ file: 'apps/api/test/parity/README.md', title: null }],
        },
      },
    ]);
  });
});
