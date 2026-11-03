import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  scanSource,
  parseDeclaredColorVars,
  listScannableFiles,
  hasAnyViolation,
  type RatchetCounts,
} from '../design-tokens/ratchet-scan';

// ---------------------------------------------------------------------------
// Design-token drift ratchet (design roadmap Phase 0, decision D11-B:
// docs/design/design-system-research-2026-11-01.md §9 "0. Safety net").
//
// This guard does not try to reach zero violations today. Phase 0 ships green
// with today's debt frozen in design-token-ratchet.baseline.json; later phases
// (D5 muted contrast, D8 role tokens, D9 radius/type scale, ...) pay it down
// file by file. What it enforces, per file and per category (hex colours,
// tiny text sizes, raw Tailwind palette classes, undefined --color-* vars):
//
//   1. No file's count may exceed its baseline — no new drift.
//   2. No new file may appear with violations that aren't baselined.
//   3. No file's count may drop BELOW its baseline either, unchanged — a real
//      fix must tighten the baseline in the same PR, so progress is always
//      visible and debt can't quietly grow back up to a stale, too-generous
//      number without this guard noticing.
//
// To regenerate the baseline (after fixing violations, or after adding a new,
// justified violation — see the allowlist below):
//
//   RATCHET_UPDATE=1 npx vitest run src/lib/__tests__/design-token-ratchet.test.ts
//
// design-token-ratchet.allowlist.json documents files whose violations are
// permanent by design (map/WebGL paint, email HTML, OG-image rendering,
// landing-page art) — not a bypass. Those files are still ratcheted exactly
// like any other; the allowlist only explains *why* raising their baseline is
// legitimate, instead of silently excluding them from the scan.
// ---------------------------------------------------------------------------

const SRC_ROOT = path.resolve(__dirname, '../..');
const GLOBALS_CSS_PATH = path.resolve(SRC_ROOT, 'app/globals.css');
const BASELINE_PATH = path.resolve(__dirname, 'design-token-ratchet.baseline.json');
const ALLOWLIST_PATH = path.resolve(__dirname, 'design-token-ratchet.allowlist.json');

type Baseline = Record<string, RatchetCounts>;
type Allowlist = Record<string, string>;

const ZERO: RatchetCounts = { hex: 0, tinyText: 0, rawPalette: 0, undefinedVars: 0 };
const CATEGORIES = ['hex', 'tinyText', 'rawPalette', 'undefinedVars'] as const;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function computeActual(): Baseline {
  const declaredVars = parseDeclaredColorVars(readFileSync(GLOBALS_CSS_PATH, 'utf8'));
  const files = listScannableFiles(SRC_ROOT);
  const actual: Baseline = {};
  for (const file of files) {
    const source = readFileSync(path.join(SRC_ROOT, file), 'utf8');
    const counts = scanSource(source, declaredVars);
    if (hasAnyViolation(counts)) {
      actual[file] = counts;
    }
  }
  return actual;
}

const UPDATE_COMMAND = 'RATCHET_UPDATE=1 npx vitest run src/lib/__tests__/design-token-ratchet.test.ts';

if (process.env.RATCHET_UPDATE === '1') {
  describe('design-token drift ratchet (RATCHET_UPDATE=1)', () => {
    it('regenerates the baseline from the current tree', () => {
      const actual = computeActual();
      writeFileSync(BASELINE_PATH, JSON.stringify(actual, null, 2) + '\n');
      expect(Object.keys(actual).length).toBeGreaterThan(0);
    });
  });
} else {
  describe('design-token drift ratchet', () => {
    const baseline = readJson<Baseline>(BASELINE_PATH);
    const allowlist = readJson<Allowlist>(ALLOWLIST_PATH);
    const actual = computeActual();

    it('scans at least one file (sanity check that the guard is not silently scanning nothing)', () => {
      expect(listScannableFiles(SRC_ROOT).length).toBeGreaterThan(50);
    });

    it('every allowlist entry has a one-line reason and corresponds to a real baseline violation', () => {
      for (const [file, reason] of Object.entries(allowlist)) {
        expect(typeof reason, `${file}: allowlist reason must be a string`).toBe('string');
        expect(reason.trim().length, `${file}: allowlist reason must not be empty`).toBeGreaterThan(0);
        expect(
          baseline[file],
          `${file}: is in the allowlist but has no baseline entry — remove it or add one`,
        ).toBeDefined();
      }
    });

    it('does not let any file exceed its frozen baseline, and does not let the baseline go stale', () => {
      const allFiles = new Set([...Object.keys(baseline), ...Object.keys(actual)]);
      const problems: string[] = [];

      for (const file of allFiles) {
        const before = baseline[file] ?? ZERO;
        const now = actual[file] ?? ZERO;
        const reason = allowlist[file];

        for (const key of CATEGORIES) {
          if (now[key] > before[key]) {
            const fixHint =
              key === 'hex'
                ? reason
                  ? `"${file}" is allowlisted ("${reason}"). If this increase is still covered by that ` +
                    `reason, run: ${UPDATE_COMMAND}. Otherwise use a design token.`
                  : `use a design token instead of a literal colour. If this is a genuine permanent ` +
                    `exception (map/WebGL paint, email HTML, OG-image rendering, landing-page art), add ` +
                    `a one-line reason to ${path.basename(ALLOWLIST_PATH)}, then run: ${UPDATE_COMMAND}`
                : key === 'tinyText'
                  ? `the DESIGN.md floor for text is 12px — use text-xs (12px) or a larger token instead.`
                  : key === 'rawPalette'
                    ? `use a design token instead of a raw Tailwind palette class (e.g. bg-blue-500) — ` +
                      `Phase 1 of the design roadmap migrates these (design-system-research-2026-11-01.md §9).`
                    : `reference a token that is declared in src/app/globals.css's @theme block, or add the ` +
                      `missing token there first.`;
            problems.push(`${file}: ${key} grew from ${before[key]} to ${now[key]} (new drift). ${fixHint}`);
          } else if (now[key] < before[key]) {
            problems.push(
              `${file}: ${key} improved from ${before[key]} to ${now[key]}. Tighten the ratchet: ${UPDATE_COMMAND}`,
            );
          }
        }
      }

      expect(problems).toEqual([]);
    });
  });
}
