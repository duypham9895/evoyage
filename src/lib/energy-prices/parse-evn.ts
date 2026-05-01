/**
 * Parser for the EVN residential electricity tariff page.
 *
 * Source: https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx
 * (English version is a static HTML table; Vietnamese version is also static).
 *
 * The page exposes tier rows like "For the kWh from 0 – 50" / "1,984". We pull
 * out the six progressive residential tiers and surface a representative tier
 * (tier 4) — the band a typical EV-owning household lands in once the car adds
 * 150–300 kWh/month of charging on top of normal household use.
 */
export interface EvnTier {
  readonly minKwh: number;
  readonly maxKwh: number | null;
  readonly vndPerKwh: number;
}

export interface EvnTariff {
  readonly tiers: readonly EvnTier[];
  readonly representativeTier: number;
  readonly representativeVndPerKwh: number;
}

// `\s*` doesn't match HTML entities like `&nbsp;`; the `[\s ]|&nbsp;` set
// covers regular whitespace, non-breaking space, and the literal entity.
const SP = '(?:[\\s\\u00a0]|&nbsp;)*';

const TIER_LABELS: ReadonlyArray<{
  readonly minKwh: number;
  readonly maxKwh: number | null;
  readonly labelRegex: RegExp;
}> = [
  { minKwh: 0,   maxKwh: 50,   labelRegex: new RegExp(`For the kWh from${SP}0${SP}[–-]${SP}50`, 'i') },
  { minKwh: 51,  maxKwh: 100,  labelRegex: new RegExp(`For the kWh from${SP}51${SP}[–-]${SP}100`, 'i') },
  { minKwh: 101, maxKwh: 200,  labelRegex: new RegExp(`For the kWh from${SP}101${SP}[–-]${SP}200`, 'i') },
  { minKwh: 201, maxKwh: 300,  labelRegex: new RegExp(`For the kWh from${SP}201${SP}[–-]${SP}300`, 'i') },
  { minKwh: 301, maxKwh: 400,  labelRegex: new RegExp(`For the kWh from${SP}301${SP}[–-]${SP}400`, 'i') },
  { minKwh: 401, maxKwh: null, labelRegex: new RegExp(`For the kWh from${SP}401${SP}kWh${SP}onwards`, 'i') },
];

const REPRESENTATIVE_TIER = 4;

function findTierPrice(html: string, labelRegex: RegExp): number | null {
  const labelMatch = html.match(labelRegex);
  if (!labelMatch || labelMatch.index === undefined) return null;
  // Look for the next price-shaped number within ~600 chars after the label.
  const window = html.slice(labelMatch.index, labelMatch.index + 600);
  const priceMatch = window.match(/([12-9],[0-9]{3})(?!\d)/);
  if (!priceMatch) return null;
  return Number.parseInt(priceMatch[1].replace(/,/g, ''), 10);
}

export function parseEvnTariff(html: string): EvnTariff {
  const tiers: EvnTier[] = [];
  for (const def of TIER_LABELS) {
    const price = findTierPrice(html, def.labelRegex);
    if (price === null) break;
    tiers.push({ minKwh: def.minKwh, maxKwh: def.maxKwh, vndPerKwh: price });
  }

  if (tiers.length < 6) {
    throw new Error(
      `EVN parser: expected 6 residential tiers, found ${tiers.length}`,
    );
  }

  return {
    tiers,
    representativeTier: REPRESENTATIVE_TIER,
    representativeVndPerKwh: tiers[REPRESENTATIVE_TIER - 1].vndPerKwh,
  };
}

/**
 * Parser for the latest MOIT (regulator) tariff Decision date.
 *
 * Source: https://www.evn.com.vn/c3/gia-dien/Bieu-gia-ban-le-dien-9-28.aspx
 *
 * The Vietnamese page lists each rate-change Decision in plain text:
 *   "Quyết định số 1279/QĐ-BCT ngày 09/5/2025"
 *
 * We pick QĐ-BCT (regulator) over QĐ-EVN (utility) because the BCT decision is
 * the legally effective date. Returns null if no QĐ-BCT is mentioned — the
 * caller decides how to fall back (typically: keep the previous JSON value).
 */
const DECISION_RE =
  /Quyết định số\s*[0-9]+\/QĐ-BCT\s*ngày\s*([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})/gi;

export function parseEvnDecisionDate(html: string): string | null {
  let latest: { iso: string; ts: number } | null = null;
  // Reset regex state because /g is stateful across calls
  DECISION_RE.lastIndex = 0;
  for (const match of html.matchAll(DECISION_RE)) {
    const dd = match[1].padStart(2, '0');
    const mm = match[2].padStart(2, '0');
    const yyyy = match[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;
    if (!latest || ts > latest.ts) latest = { iso, ts };
  }
  return latest ? latest.iso : null;
}
