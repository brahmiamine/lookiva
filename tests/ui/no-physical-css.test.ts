import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tailwind classes use a left boundary of "not a word char" (so `-ml-4`, `md:ml-2`, `scroll-ml-2` are caught,
// `html-` is not). `\b` on the right keeps `rounded-lg` / `border-lime-500` out.
const L = String.raw`(?<![A-Za-z0-9_])`;
const PATTERNS: RegExp[] = [
  new RegExp(`${L}(?:ml|mr|pl|pr)-`),
  new RegExp(`${L}(?:left|right)-`),
  new RegExp(`${L}text-(?:left|right)\\b`),
  new RegExp(`${L}rounded-(?:l|r|tl|tr|bl|br)\\b`),
  new RegExp(`${L}border-(?:l|r)\\b`),
  new RegExp(`${L}float-(?:left|right)\\b`),
  new RegExp(`${L}scroll-(?:ml|mr|pl|pr)-`),
  /\b(?:margin|padding)-(?:left|right)\b/,
  /\bborder-(?:left|right)\b/,
  /(?<![\w-])(?:left|right)\s*:/,
  /\btext-align\s*:\s*(?:left|right)\b/,
  /\bfloat\s*:\s*(?:left|right)\b/,
];

export function physicalHits(text: string): string[] {
  return PATTERNS.flatMap((re) => {
    const m = re.exec(text);
    return m ? [m[0]] : [];
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'generated' || e.name === 'node_modules') return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx|css|html)$/.test(e.name) ? [p] : [];
  });
}

describe('physical CSS ban', () => {
  it('no_physical_css_classes', () => {
    const root = new URL('../../src/', import.meta.url).pathname;
    const files = ['ui', 'app'].flatMap((d) => walk(join(root, d)));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((f) => physicalHits(readFileSync(f, 'utf8')).map((h) => `${f}: ${h}`));
    expect(offenders).toEqual([]);
  });

  it('no_physical_css_detector_catches_violations', () => {
    const bad = [
      'ml-2', 'mr-4', 'pl-1', 'pr-3', 'left-0', 'right-0', 'text-left', 'text-right',
      'rounded-l', 'rounded-r-lg', 'rounded-tl-md', 'rounded-tr', 'rounded-bl', 'rounded-br',
      'border-l', 'border-r-2', 'float-left', 'float-right',
      'scroll-ml-2', 'scroll-mr-2', 'scroll-pl-2', 'scroll-pr-2', 'md:ml-2', '-ml-4',
      'margin-left: 1px', 'margin-right: 1px', 'padding-left: 1px', 'padding-right: 1px',
      'border-left: 1px solid', 'border-right-color: red', 'left: 0', 'right:0',
      'text-align: left', 'text-align:right', 'float: left', 'float:right',
    ];
    for (const s of bad) expect(physicalHits(`class="${s}"`), s).not.toEqual([]);
    const good = [
      'ms-2', 'me-2', 'ps-2', 'pe-2', 'start-0', 'end-0', 'text-start', 'text-end', 'rounded-s', 'rounded-e-lg',
      'border-s', 'border-e-2', 'margin-inline-start: 1px', 'padding-inline-end: 1px', 'inset-inline-start: 0',
      'text-align: start', 'overflow-hidden', 'rounded-lg', 'border-lime-500', 'html-foo', 'float-start',
      'border-inline-start: 1px solid', 'scroll-ms-2',
    ];
    for (const s of good) expect(physicalHits(`class="${s}"`), s).toEqual([]);
  });
});
