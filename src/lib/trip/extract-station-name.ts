/**
 * Truncate a long station name into a short label suitable for the
 * RouteTimeline column (~80 px wide on mobile).
 *
 * Per docs/specs/2026-05-03-trip-overview-timeline-design.md §6:
 * 1. Strip known prefixes (case-insensitive)
 * 2. Take the last 2 words. If < 8 chars, take the last 3 instead.
 * 3. Hard-cap at 14 chars (truncate with `…`).
 *
 * Empty / cleaning failures fall back to the literal "Trạm" so the caller
 * can compose ordinal labels like "Trạm 1", "Trạm 2" if desired.
 */

const MAX_LEN = 14;
const SHORT_TWO_WORDS_THRESHOLD = 8;
const FALLBACK = 'Trạm';

const PREFIXES: readonly RegExp[] = [
  /^Nhượng quyền VinFast\s+/i,
  /^Nhượng quyền Vinfast\s+/i,
  /^V-GREEN\s+/i,
  /^VinFast\s+/i,
  /^Trạm sạc\s+/i,
  /^NQ\s+/i,
];

function truncate(s: string): string {
  if (s.length <= MAX_LEN) return s;
  return `${s.slice(0, MAX_LEN - 1)}…`;
}

export function extractStationShortName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return FALLBACK;

  let stripped = trimmed;
  for (const prefix of PREFIXES) {
    stripped = stripped.replace(prefix, '');
  }
  stripped = stripped.replace(/\s+/g, ' ').trim();
  if (!stripped) return FALLBACK;

  const words = stripped.split(' ');
  if (words.length <= 2) return truncate(stripped);

  const lastTwo = words.slice(-2).join(' ');
  if (lastTwo.length >= SHORT_TWO_WORDS_THRESHOLD) {
    return truncate(lastTwo);
  }

  const lastThree = words.slice(-3).join(' ');
  return truncate(lastThree);
}
