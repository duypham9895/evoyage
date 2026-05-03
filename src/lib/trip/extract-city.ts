/**
 * Extract a display-friendly city/province name from a full geocoded address.
 *
 * Used by the Trip Overview headline ("TP.HCM → Đà Lạt") to replace the
 * verbatim address echo that v3 of the spec identified as noise.
 *
 * Algorithm (per docs/specs/2026-05-03-trip-overview-timeline-design.md §5):
 * 1. Split by `,`, drop empty segments, trim whitespace
 * 2. Drop trailing "Việt Nam"
 * 3. Drop pure-digit segments (postal codes)
 * 4. Walk parts from start → end; pick first match for known VN patterns.
 *    Direction matters: VN addresses go specific → broad (street, ward,
 *    district, city, province), so start → end finds Thành phố before
 *    Tỉnh — drivers care about cities (Đà Lạt) more than provinces (Lâm Đồng).
 * 5. Fallback to second-to-last meaningful part
 * 6. Final fallback: truncated address with ellipsis
 *
 * Hard-cap at 12 chars; the timeline column is ~80 px wide on mobile.
 */

const MAX_LEN = 12;
const FALLBACK = '—';

const PATTERNS: ReadonlyArray<{ test: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  { test: /^Th(à|à)nh ph(ố|o) Hồ Chí Minh$/i, replace: () => 'TP.HCM' },
  { test: /^TP\.\s*Hồ Chí Minh$/i, replace: () => 'TP.HCM' },
  { test: /^(?:Thành phố|Thủ đô) Hà Nội$/i, replace: () => 'Hà Nội' },
  { test: /^Thành phố (.+)$/i, replace: (m) => m[1]!.trim() },
  { test: /^Tỉnh (.+)$/i, replace: (m) => m[1]!.trim() },
];

function truncate(s: string): string {
  if (s.length <= MAX_LEN) return s;
  return `${s.slice(0, MAX_LEN - 1)}…`;
}

export function extractCityName(rawAddress: string): string {
  const trimmed = rawAddress.trim();
  if (!trimmed) return FALLBACK;

  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/^[0-9]+$/.test(s)) // drop postal codes
    .filter((s) => s.toLowerCase() !== 'việt nam');

  if (parts.length === 0) return FALLBACK;

  // Walk start → end so Thành phố (more specific) is matched before Tỉnh
  for (const part of parts) {
    for (const pattern of PATTERNS) {
      const match = part.match(pattern.test);
      if (match) return truncate(pattern.replace(match));
    }
  }

  // No pattern matched — fall back to second-to-last meaningful part
  // (skips most-specific street segment, leaving district-level info)
  const fallbackIdx = Math.max(0, parts.length - 2);
  return truncate(parts[fallbackIdx]!);
}
