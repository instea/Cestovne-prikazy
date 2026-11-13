// DOC-01: drift checks of docs/functional-spec.md. A moved or renamed
// implementation / test file, an edited worked example or a date-holidays
// bump fails here, so the functional spec is updated in the same PR.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkFile,
  headingAnchors,
  linkTargets,
  ROOT,
  slug,
  stripCode,
} from './check-md-links.mjs';

const SPEC = resolve(ROOT, 'docs/functional-spec.md');
const spec = readFileSync(SPEC, 'utf8');

/**
 * Every "Implemented by:" block (the bullet or paragraph up to the next
 * "Proven by:", bullet, heading or blank line): its text.
 */
export function implementedByBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/Implemented by:?\**:?/.test(lines[i])) continue;
    const indent = lines[i].search(/\S/);
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      const lineIndent = line.search(/\S/);
      if (
        line.trim() === '' ||
        /^#/.test(line) ||
        /Proven by/.test(line) ||
        (lineIndent <= indent && /^\s*- /.test(line))
      ) {
        break;
      }
      block.push(line);
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

/** A code span that names a symbol: `fooBar`, `Foo.bar`, `FOO_BAR`, `foo()`. */
const SYMBOL =
  /^(?:[a-z]+[A-Z][\w$]*|[A-Z][a-z]+[A-Z]?[\w$]*|[A-Z][A-Z\d]*(?:_[A-Z\d]+)+|[A-Za-z_$][\w$]*\(\))(?:\.[A-Za-z_$][\w$]*)?(?:\(\))?$/;

/**
 * [symbol, cited files] of every code-span symbol in an "Implemented by"
 * block that cites at least one `packages/shared/src/` or `apps/api/src/`
 * file (the symbol must occur in one of the block's cited files).
 */
export function citedSymbols(block) {
  const files = [...block.matchAll(/\]\((\.\.\/[^)\s#]+)/g)].map((m) => m[1]);
  if (
    !files.some((f) => /^\.\.\/(packages\/shared|apps\/api)\/src\//.test(f))
  ) {
    return [];
  }
  const text = block.replace(/\[`[^`]*`\]\([^)]*\)/g, ''); // link labels
  return [...text.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1])
    .filter((code) => SYMBOL.test(code))
    .map((code) => [code, files]);
}

/**
 * Whether every part of `Foo.bar()` occurs as a word in `source`, outside
 * comments (a doc comment that merely mentions it does not count).
 */
export function symbolIn(symbol, source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return symbol
    .replace(/\(\)/g, '')
    .split('.')
    .every((part) =>
      new RegExp(`(?<![\\w$])${part.replace(/\$/g, '\\$')}(?![\\w$])`).test(
        code,
      ),
    );
}

/** `<!-- literal: <path> -->` followed by a fenced block: [path, body]. */
function literalBlocks(markdown) {
  const re = /<!-- literal: (\S+) -->\n```\w*\n([\s\S]*?)\n```/g;
  return [...markdown.matchAll(re)].map((m) => [m[1], m[2]]);
}

describe('docs/functional-spec.md (DOC-01)', () => {
  it('has no broken relative links or anchors', () => {
    expect(checkFile(SPEC)).toEqual([]);
  });

  it('has the 10 required sections in order', () => {
    const sections = [...spec.matchAll(/^## (\d+)\. (.+)$/gm)].map(
      (m) => `${m[1]}. ${m[2].trim()}`,
    );
    expect(sections).toEqual([
      '1. Glossary',
      '2. Leave data',
      '3. Work-day rules',
      '4. Leave types',
      '5. States and approval flow',
      '6. Delete rules',
      '7. Visibility and filters',
      '8. Attendance API',
      '9. Data migration notes',
      '10. Changes vs the old system',
    ]);
  });

  it('names only symbols that exist in the cited shared / api files', () => {
    const checked = implementedByBlocks(spec).flatMap(citedSymbols);
    expect(checked.length).toBeGreaterThan(40);
    const missing = checked.flatMap(([symbol, files]) => {
      const found = files.some((file) =>
        symbolIn(symbol, readFileSync(resolve(dirname(SPEC), file), 'utf8')),
      );
      return found ? [] : [`${symbol} (not in ${files.join(', ')})`];
    });
    expect(missing).toEqual([]);
  });

  it('cites an implementation and a test file in every rule block', () => {
    const implemented = spec.match(/Implemented by:/g) ?? [];
    const proven = spec.match(/Proven by:/g) ?? [];
    expect(implemented.length).toBeGreaterThan(20);
    expect(proven.length).toBeGreaterThanOrEqual(implemented.length - 3);
  });

  it('copies its worked examples literally from existing tests', () => {
    const blocks = literalBlocks(spec);
    // Section 3: two blocks; section 8: four blocks.
    expect(blocks.length).toBeGreaterThanOrEqual(6);
    for (const [path, body] of blocks) {
      const source = readFileSync(resolve(dirname(SPEC), path), 'utf8');
      expect(source, `${path} no longer contains:\n${body}`).toContain(body);
    }
  });

  it('names the pinned date-holidays version', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, 'packages/shared/package.json'), 'utf8'),
    );
    const version = pkg.dependencies['date-holidays'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/); // pinned exactly
    expect(spec).toContain(`version **${version}**`);
    const lock = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8');
    expect(lock).toContain(`date-holidays@${version}:`);
  });
});

describe('Implemented-by symbol check', () => {
  const block = [
    '- Implemented by: `colorForUser` and `LEAVE_TYPE_LETTERS` in',
    '  [`packages/shared/src/calendar.ts`](../packages/shared/src/calendar.ts);',
    '  `LeavesService.decide` in',
    '  [`apps/api/src/leaves/leaves.service.ts`](../apps/api/src/leaves/leaves.service.ts);',
    '  `POST /api/leaves`, `APPROVED`, `leaveType.*` are not symbols.',
    '- Proven by: x',
  ].join('\n');

  it('collects the code-span symbols of a block with shared / api citations', () => {
    const [only] = implementedByBlocks(block);
    expect(citedSymbols(only).map(([s]) => s)).toEqual([
      'colorForUser',
      'LEAVE_TYPE_LETTERS',
      'LeavesService.decide',
    ]);
    expect(
      citedSymbols('- Implemented by: `foo` in [`a`](../apps/web/src/a.ts)'),
    ).toEqual([]);
  });

  it('fails a renamed symbol or a link to the wrong file', () => {
    const calendar = readFileSync(
      resolve(ROOT, 'packages/shared/src/calendar.ts'),
      'utf8',
    );
    const users = readFileSync(
      resolve(ROOT, 'packages/shared/src/users.ts'),
      'utf8',
    );
    expect(symbolIn('colorForUser', calendar)).toBe(true);
    expect(
      symbolIn(
        'colorForUser',
        calendar.replaceAll('colorForUser', 'userColor'),
      ),
    ).toBe(false);
    // colorForUser lives in calendar.ts, not users.ts.
    expect(symbolIn('colorForUser', users)).toBe(false);
    expect(symbolIn('colorFor', calendar)).toBe(false);
    expect(
      symbolIn('LeavesService.decide', 'class LeavesService { decide() {} }'),
    ).toBe(true);
    expect(
      symbolIn('LeavesService.decide', 'class LeavesService { remove() {} }'),
    ).toBe(false);
  });
});

describe('check-md-links helpers', () => {
  it('slugs headings like GitHub', () => {
    expect(slug('10. Changes vs the old system')).toBe(
      '10-changes-vs-the-old-system',
    );
    expect(slug('Leave codes')).toBe('leave-codes');
  });

  it('suffixes duplicate headings', () => {
    expect([...headingAnchors('# A\n## A\n### B\n')]).toEqual([
      'a',
      'a-1',
      'b',
    ]);
  });

  it('ignores links inside code', () => {
    const md = '[a](x.md)\n```\n[b](y.md)\n```\n`[c](z.md)` [d](w.md "t")';
    expect(linkTargets(md)).toEqual(['x.md', 'w.md']);
    expect(stripCode('`x` y')).toBe(' y');
  });
});
