#!/usr/bin/env node
// Relative-link check for the maintained Markdown docs (DOC-01).
//
// Every relative link must point to an existing file or directory, and every
// `#anchor` must match a heading of the target Markdown file (GitHub slugs).
// External links (`http:`, `https:`, `mailto:`) are not fetched.
//
//   node scripts/check-md-links.mjs [file.md ...]   (default: DEFAULT_FILES)
//
// Exit code 1 when a link is broken. NFR-09 runs it in the CI `lint` job
// (`pnpm lint:links`).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Docs checked when no file is given (root-relative). */
export const DEFAULT_FILES = ['docs/functional-spec.md', 'deploy/README.md'];

/** Markdown with fenced code blocks and inline code spans blanked out. */
export function stripCode(markdown) {
  const lines = markdown.split('\n');
  let fence = null;
  return lines
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length
        )
          fence = null;
        return '';
      }
      if (marker) {
        fence = marker[1];
        return '';
      }
      return line.replace(/(`+)[^`]*?\1/g, '');
    })
    .join('\n');
}

/** GitHub heading slug: lowercase, punctuation dropped, spaces to `-`. */
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Anchors of all ATX headings of `markdown`, with GitHub `-1` suffixes. */
export function headingAnchors(markdown) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of stripCode(markdown).split('\n')) {
    const m = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slug(m[1].replace(/`/g, ''));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

/** Inline link and image targets of `markdown` (code excluded). */
export function linkTargets(markdown) {
  const targets = [];
  const re = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const m of stripCode(markdown).matchAll(re)) targets.push(m[1]);
  return targets;
}

const isExternal = (target) => /^[a-z][a-z0-9+.-]*:/i.test(target);

/**
 * Broken relative links of the Markdown file `file` (absolute path), as
 * human-readable messages.
 */
export function checkFile(file) {
  const markdown = readFileSync(file, 'utf8');
  const problems = [];
  const rel = relative(ROOT, file);
  for (const target of linkTargets(markdown)) {
    if (isExternal(target)) continue;
    const [path, anchor] = target.split('#', 2);
    const resolved = path ? resolve(dirname(file), decodeURI(path)) : file;
    if (!existsSync(resolved)) {
      problems.push(`${rel}: missing file ${target}`);
      continue;
    }
    if (anchor === undefined) continue;
    if (!resolved.endsWith('.md') || statSync(resolved).isDirectory()) {
      problems.push(`${rel}: anchor on a non-Markdown target ${target}`);
      continue;
    }
    const anchors =
      resolved === file
        ? headingAnchors(markdown)
        : headingAnchors(readFileSync(resolved, 'utf8'));
    if (!anchors.has(decodeURIComponent(anchor)))
      problems.push(`${rel}: missing anchor ${target}`);
  }
  return problems;
}

function main(args) {
  const files = (args.length > 0 ? args : DEFAULT_FILES).map((f) =>
    resolve(ROOT, f),
  );
  const problems = files.flatMap((file) =>
    existsSync(file) ? checkFile(file) : [`missing Markdown file ${file}`],
  );
  for (const p of problems) console.error(p);
  if (problems.length > 0) {
    console.error(`${problems.length} broken link(s)`);
    process.exit(1);
  }
  console.log(`Links OK in ${files.length} file(s)`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
