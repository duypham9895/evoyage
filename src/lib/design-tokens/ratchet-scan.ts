// Pure, filesystem-free scanners used by the design-token drift ratchet guard
// (src/lib/__tests__/design-token-ratchet.test.ts). Every exported function here
// takes raw source text and returns a count or a parsed set — none of them touch
// the filesystem, so they're cheap to unit-test with plain string fixtures.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Strips `//` line comments and `/* *\/` block comments from source text while
 * leaving string and template-literal contents untouched. This matters for two
 * reasons: a colour or token reference that only exists in a comment shouldn't
 * count as a violation, and a `//` inside a URL string (`"https://..."`) must
 * not be mistaken for a comment start. Limitation: this is not a full JS/TS
 * tokenizer — it does not understand regex literals or nested template-literal
 * expressions. That's fine for scanning design-token patterns, which never
 * appear inside either.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== '*/') i++;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ch;
      i++;
      while (i < n && source[i] !== ch) {
        if (source[i] === '\\' && i + 1 < n) {
          out += source[i] + source[i + 1];
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      if (i < n) {
        out += source[i];
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Longest-first so e.g. an 8-digit hex isn't under-matched as a 6-digit one
// with two leftover word characters (\b would reject that anyway, but this
// keeps the intent obvious).
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\(\s*\d/g;
const TINY_TEXT_RE = /text-\[(?:9|10|11)px\]/g;
const COLOR_VAR_RE = /var\(--color-([a-zA-Z0-9-]+)\)/g;

// Tailwind's default numbered colour families (v3/v4). Deliberately excludes
// white/black/transparent/current — those aren't part of the numbered
// palette and aren't the "raw palette class" drift this guard tracks.
const TAILWIND_PALETTE_FAMILIES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const TAILWIND_COLOR_PREFIXES =
  'bg|text|border|ring|fill|stroke|divide|outline|decoration|accent|caret|from|via|to|shadow|placeholder';
const RAW_PALETTE_CLASS_RE = new RegExp(
  `\\b(?:${TAILWIND_COLOR_PREFIXES})-(?:${TAILWIND_PALETTE_FAMILIES})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
  'g',
);

/** Counts hex colour literals and rgb()/rgba()/hsl()/hsla() literals with a numeric first argument. */
export function countHardcodedColors(source: string): number {
  const code = stripComments(source);
  const hex = code.match(HEX_COLOR_RE)?.length ?? 0;
  const fn = code.match(COLOR_FN_RE)?.length ?? 0;
  return hex + fn;
}

/** Counts arbitrary Tailwind text sizes below the DESIGN.md 12px floor (text-[9px]/[10px]/[11px]). */
export function countTinyTextSizes(source: string): number {
  const code = stripComments(source);
  return code.match(TINY_TEXT_RE)?.length ?? 0;
}

/** Counts raw Tailwind palette classes (e.g. `bg-blue-500`, `text-amber-500/10`) that bypass the app's design tokens. */
export function countRawPaletteClasses(source: string): number {
  const code = stripComments(source);
  return code.match(RAW_PALETTE_CLASS_RE)?.length ?? 0;
}

/** Counts var(--color-NAME) references whose NAME is not in the declared token set. */
export function countUndefinedColorVars(source: string, declaredVars: ReadonlySet<string>): number {
  const code = stripComments(source);
  let count = 0;
  for (const match of code.matchAll(COLOR_VAR_RE)) {
    if (!declaredVars.has(match[1])) count++;
  }
  return count;
}

export interface RatchetCounts {
  hex: number;
  tinyText: number;
  rawPalette: number;
  undefinedVars: number;
}

/** True when any category has a violation; category-agnostic so a new category can't be silently skipped. */
export function hasAnyViolation(counts: RatchetCounts): boolean {
  return Object.values(counts).some((n) => n > 0);
}

/** Runs all four scanners over one file's source text. */
export function scanSource(source: string, declaredVars: ReadonlySet<string>): RatchetCounts {
  return {
    hex: countHardcodedColors(source),
    tinyText: countTinyTextSizes(source),
    rawPalette: countRawPaletteClasses(source),
    undefinedVars: countUndefinedColorVars(source, declaredVars),
  };
}

/**
 * Parses `--color-NAME: ...` declarations out of every Tailwind v4 `@theme` /
 * `@theme inline` block and every `:root` block in a CSS source string.
 * Brace-matched rather than line-based, so formatting doesn't matter.
 */
export function parseDeclaredColorVars(css: string): Set<string> {
  const names = new Set<string>();
  const blockStart = /(?:@theme(?:\s+inline)?|:root)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = blockStart.exec(css))) {
    const openBrace = blockStart.lastIndex - 1;
    let depth = 1;
    let i = openBrace + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const block = css.slice(openBrace + 1, i - 1);
    for (const m of block.matchAll(/--color-([a-zA-Z0-9-]+)\s*:/g)) {
      names.add(m[1]);
    }
    blockStart.lastIndex = i;
  }
  return names;
}

/**
 * Recursively lists .ts/.tsx files under rootDir (relative, POSIX-separated
 * paths), excluding `*.test.*` files and anything under a `__tests__`
 * directory — the same scope the design-token ratchet guard scans.
 */
export function listScannableFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === '__tests__') continue;
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      results.push(path.relative(rootDir, full).split(path.sep).join('/'));
    }
  }

  walk(rootDir);
  return results;
}
