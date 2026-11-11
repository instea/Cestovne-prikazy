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
    const sections = [...spec.matchAll(/^## (\d+)\. /gm)].map((m) =>
      Number(m[1]),
    );
    expect(sections).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
