import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Deliberately NOT flagged: `translate-x-*` (direction-neutral uses such as centering exist) and directional gradients
// (`bg-gradient-to-r`, `bg-linear-to-r`). Reviewers must check those by hand for RTL.
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
  /\bborder-(?:top|bottom)-(?:left|right)-radius\b/,
  /\bscroll-(?:margin|padding)-(?:left|right)\b/,
  /(?<![\w-])(?:left|right)\s*:/,
  /\b(?:text-align|textAlign)\s*:\s*['"]?(?:left|right)\b/,
  /\b(?:float|clear)\s*:\s*['"]?(?:left|right)\b/,
  // style objects (camelCase): marginLeft, borderRightWidth, scrollPaddingLeft, ...
  /\b(?:margin|padding|border|scrollMargin|scrollPadding)(?:Left|Right)(?:Width|Color|Style)?\b/,
  /\bborder(?:Top|Bottom)(?:Left|Right)Radius\b/,
  // Tailwind background / object / origin / clear utilities
  new RegExp(`${L}(?:bg|object|origin|clear)-(?:left|right)\\b`),
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
      // style objects (camelCase)
      'marginLeft: 8', 'marginRight: 8', 'paddingLeft: 8', 'paddingRight: 8', 'borderLeft: "1px solid"', 'borderRight: "1px solid"',
      'borderLeftWidth: 1', 'borderRightWidth: 1', 'borderLeftColor: "red"', 'borderRightColor: "red"',
      'borderTopLeftRadius: 4', 'borderTopRightRadius: 4', 'borderBottomLeftRadius: 4', 'borderBottomRightRadius: 4',
      "textAlign: 'left'", 'textAlign: "right"', "float: 'left'", 'float: "right"', "clear: 'left'", 'clear: "right"',
      'scrollMarginLeft: 4', 'scrollMarginRight: 4', 'scrollPaddingLeft: 4', 'scrollPaddingRight: 4',
      // CSS corner / clear / scroll longhands
      'border-top-left-radius: 4px', 'border-bottom-right-radius: 4px', 'clear: left', 'clear:right',
      'scroll-margin-left: 4px', 'scroll-padding-right: 4px',
      // Tailwind
      'bg-left', 'bg-right-top', 'object-left', 'object-right-bottom', 'origin-left', 'origin-right', 'clear-left', 'clear-right',
    ];
    for (const s of bad) expect(physicalHits(`class="${s}"`), s).not.toEqual([]);
    const good = [
      'ms-2', 'me-2', 'ps-2', 'pe-2', 'start-0', 'end-0', 'text-start', 'text-end', 'rounded-s', 'rounded-e-lg',
      'border-s', 'border-e-2', 'margin-inline-start: 1px', 'padding-inline-end: 1px', 'inset-inline-start: 0',
      'text-align: start', 'overflow-hidden', 'rounded-lg', 'border-lime-500', 'html-foo', 'float-start',
      'border-inline-start: 1px solid', 'scroll-ms-2',
      'marginInlineStart: 8', 'paddingInlineEnd: 8', 'borderInlineStartWidth: 1', 'borderStartStartRadius: 4',
      "textAlign: 'start'", "float: 'inline-start'", "clear: 'both'", 'clear-both', 'object-cover', 'origin-center',
      'bg-linear-to-r', 'bg-gradient-to-r', 'translate-x-1/2', 'html-lang', 'border-start-start-radius: 4px',
    ];
    for (const s of good) expect(physicalHits(`class="${s}"`), s).toEqual([]);
  });
});
