/**
 * Parser for the Petrolimex price widget.
 *
 * Petrolimex's homepage hydrates a price table client-side via the VIEApps NGX
 * `cms.item/search` API. We capture the resulting `__vieapps.prices.products`
 * array using Playwright (see scripts/crawl-energy-prices.ts) and pipe the raw
 * objects into this parser, which:
 *   - normalizes the seven known products to stable keys (`ron95v`, `do005s`, …)
 *   - keeps Zone 1 (lowland) prices for v1 — Zone 2 is only used in remote
 *     mountain districts and adds UI complexity we don't need yet
 *   - surfaces the most recent `LastModified` as the effective date
 */
export interface PetrolimexProduct {
  readonly label: string;
  readonly vndPerLiter: number;
}

export interface PetrolimexPrices {
  readonly products: Readonly<Record<string, PetrolimexProduct>>;
  readonly effectiveAt: string;
}

interface PetrolimexRawProduct {
  readonly ID?: string;
  readonly Title?: string;
  readonly EnglishTitle?: string;
  readonly Zone1Price?: number;
  readonly Zone2Price?: number;
  readonly OrderIndex?: number;
  readonly LastModified?: string;
}

// Map the upstream English title to our canonical key. Adding a new product is
// a one-line change — the parser ignores anything not listed here.
const TITLE_TO_KEY: ReadonlyMap<string, string> = new Map([
  ['RON 95-V', 'ron95v'],
  ['RON 95-III', 'ron95iii'],
  ['E10 RON 95-III', 'e10ron95iii'],
  ['E5 RON 92-II', 'e5ron92'],
  ['DO 0,001S-V', 'do0001s'],
  ['DO 0.001S-V', 'do0001s'],
  ['DO 0,05S-II', 'do005s'],
  ['DO 0.05S-II', 'do005s'],
  ['2-K Kerosene', 'kerosene'],
]);

const REQUIRED_KEYS = new Set(['ron95iii', 'do005s']);

export function parsePetrolimexProducts(
  rawProducts: ReadonlyArray<unknown>,
): PetrolimexPrices {
  if (rawProducts.length === 0) {
    throw new Error('Petrolimex parser: empty products array');
  }

  const products: Record<string, PetrolimexProduct> = {};
  let latestModified = 0;

  for (const raw of rawProducts) {
    const r = raw as PetrolimexRawProduct;
    const englishTitle = r.EnglishTitle?.trim();
    const title = r.Title?.trim();
    const zone1 = r.Zone1Price;
    const lastModified = r.LastModified;

    if (!englishTitle || !title || typeof zone1 !== 'number' || !lastModified) continue;

    const key = TITLE_TO_KEY.get(englishTitle);
    if (!key) continue; // unknown product → skip silently

    products[key] = { label: title, vndPerLiter: zone1 };

    const t = Date.parse(lastModified);
    if (!Number.isNaN(t) && t > latestModified) latestModified = t;
  }

  for (const required of REQUIRED_KEYS) {
    if (!(required in products)) {
      throw new Error(
        `Petrolimex parser: required product "${required}" missing from feed`,
      );
    }
  }

  if (latestModified === 0) {
    throw new Error('Petrolimex parser: no valid LastModified timestamp');
  }

  return {
    products,
    effectiveAt: new Date(latestModified).toISOString(),
  };
}
