/**
 * Crawl Vietnam fuel + electricity prices from authoritative public sources.
 *
 * Sources:
 *   - Petrolimex homepage  → gas + diesel retail prices (Zone 1)
 *   - V-GREEN FAQ          → public charging rate (VND/kWh)
 *   - EVN tariff archive   → residential progressive electricity tariff, found
 *                            by content (see `selectEvnResidentialArticle`)
 *                            because EVN reuses article ids across decisions
 *
 * Writes the merged result to `src/data/energy-prices.json`. Same pattern as
 * `scripts/crawl-vinfast-stations.ts`.
 *
 * Run: npx tsx scripts/crawl-energy-prices.ts
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePetrolimexProducts, type PetrolimexPrices } from '../src/lib/energy-prices/parse-petrolimex';
import { parseVGreenFaq, type VGreenPrice } from '../src/lib/energy-prices/parse-vgreen';
import {
  extractEvnTariffArticleUrls,
  selectEvnResidentialArticle,
  assertEvnDecisionNotOlderThanPublished,
  type EvnArticleCandidate,
  type EvnTariff,
} from '../src/lib/energy-prices/parse-evn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'src/data/energy-prices.json');

const PETROLIMEX_URL = 'https://www.petrolimex.com.vn/index.html';
// Internal CMS endpoint that hydrates `__vieapps.prices.products` on the homepage.
// The three UUIDs identify the "fuel prices" collection. If they ever change,
// the homepage `__vieapps` global is the canonical fallback (see git history).
const PETROLIMEX_API_URL =
  'https://portals.petrolimex.com.vn/~apis/portals/cms.item/search';
const PETROLIMEX_FILTER = {
  FilterBy: {
    And: [
      { SystemID: { Equals: '6783dc1271ff449e95b74a9520964169' } },
      { RepositoryID: { Equals: 'a95451e23b474fe5886bfb7cf843f53c' } },
      { RepositoryEntityID: { Equals: '3801378fe1e045b1afa10de7c5776124' } },
    ],
  },
};
const VGREEN_URL = 'https://vgreen.net/vi/cau-hoi-thuong-gap';
// Archive listing for the "Electricity Tariff" category. The residential article
// is resolved from here on every run, so a new decision is picked up without a
// code change and a repurposed article id can't be mistaken for the tariff.
const EVN_LISTING_URL = 'https://en.evn.com.vn/en-US/news-l/Electricity-Tariff-60-28';

const FREE_FOR_VINFAST_UNTIL = '2029-12-31';

interface EnergyPricesFile {
  readonly lastSyncedAt: string;
  readonly petrolimex: {
    readonly source: string;
    readonly effectiveAt: string;
    readonly products: PetrolimexPrices['products'];
  };
  readonly vgreen: {
    readonly source: string;
    readonly effectiveAt: string;
    readonly vndPerKwh: number;
    readonly freeForVinFastUntil: string;
  };
  readonly evnResidential: {
    readonly source: string;
    readonly effectiveAt: string;
    readonly tiers: EvnTariff['tiers'];
    readonly representativeTier: number;
    readonly representativeVndPerKwh: number;
  };
}

async function fetchPetrolimex(): Promise<PetrolimexPrices> {
  const xRequest = Buffer.from(JSON.stringify(PETROLIMEX_FILTER)).toString('base64url');
  const url = `${PETROLIMEX_API_URL}?x-request=${xRequest}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Petrolimex fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { Objects?: unknown };
  if (!Array.isArray(body.Objects)) {
    throw new Error('Petrolimex fetch: response missing Objects array');
  }
  return parsePetrolimexProducts(body.Objects);
}

async function fetchVGreen(): Promise<VGreenPrice> {
  const res = await fetch(VGREEN_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`V-GREEN fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  return parseVGreenFaq(html);
}

interface EvnResult extends EvnTariff {
  readonly source: string;
  readonly effectiveAt: string;
}

// The listing links 5 tariff articles today. A listing regression that emits
// hundreds of matching hrefs would fan out against one upstream host, so refuse
// rather than truncate: a silently truncated candidate set is how an older
// decision wins.
const MAX_EVN_CANDIDATES = 10;

async function fetchEvnHtmlOnce(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`EVN fetch failed: HTTP ${res.status} for ${url}`);
  return res.text();
}

/** One retry: discovery needs 6 fetches where the old code needed 1, and every
 *  one of them is fatal, so a single blip would freeze all three sources. */
async function fetchEvnHtml(url: string): Promise<string> {
  try {
    return await fetchEvnHtmlOnce(url);
  } catch (err) {
    console.warn(`[energy-prices] EVN fetch failed, retrying once: ${(err as Error).message}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return fetchEvnHtmlOnce(url);
  }
}

async function fetchEvn(previous: EnergyPricesFile | null): Promise<EvnResult> {
  const urls = extractEvnTariffArticleUrls(await fetchEvnHtml(EVN_LISTING_URL));
  if (urls.length === 0) {
    throw new Error(`EVN: no tariff articles linked from ${EVN_LISTING_URL}`);
  }
  if (urls.length > MAX_EVN_CANDIDATES) {
    throw new Error(
      `EVN: listing yielded ${urls.length} tariff articles, more than the ${MAX_EVN_CANDIDATES} expected`,
    );
  }

  // Every listed article must be read. A tolerated fetch failure would shrink
  // the candidate set, and a smaller set is how an older decision wins.
  const candidates: EvnArticleCandidate[] = await Promise.all(
    urls.map(async (url) => ({ url, html: await fetchEvnHtml(url) })),
  );

  const article = selectEvnResidentialArticle(candidates);
  assertEvnDecisionNotOlderThanPublished(article, previous?.evnResidential.effectiveAt);
  console.log(
    `[energy-prices] EVN residential tariff: Decision ${article.decisionNo}/QD-BCT (${article.effectiveAt}) — ${article.url}`,
  );
  return { ...article.tariff, source: article.url, effectiveAt: article.effectiveAt };
}

function readPrevious(): EnergyPricesFile | null {
  if (!existsSync(OUTPUT)) return null;
  try {
    return JSON.parse(readFileSync(OUTPUT, 'utf8')) as EnergyPricesFile;
  } catch {
    return null;
  }
}

async function main() {
  const previous = readPrevious();
  console.log('[energy-prices] starting crawl');

  const results = await Promise.allSettled([
    fetchPetrolimex(),
    fetchVGreen(),
    fetchEvn(previous),
  ]);
  const [petrolimexRes, vgreenRes, evnRes] = results;

  // If a source fails, fall back to its previous value so the file stays
  // complete, but exit non-zero at the end. Logging alone was not enough:
  // Petrolimex failed every day from 2026-05-28 while the job stayed green and
  // the sync PR kept stamping a fresh lastSyncedAt onto May prices.
  const failedSources: string[] = [];
  function pick<T>(label: string, res: PromiseSettledResult<T>, fallback: T | null): T {
    if (res.status === 'fulfilled') return res.value;
    failedSources.push(label);
    console.error(`[energy-prices] ${label} crawl failed:`, res.reason);
    if (fallback === null) {
      throw new Error(
        `[energy-prices] ${label} failed AND no previous value to fall back on`,
      );
    }
    console.warn(`[energy-prices] ${label} reusing previous value`);
    return fallback;
  }

  const petrolimex = pick(
    'Petrolimex',
    petrolimexRes,
    previous
      ? {
          products: previous.petrolimex.products,
          effectiveAt: previous.petrolimex.effectiveAt,
        }
      : null,
  );
  const vgreen = pick(
    'V-GREEN',
    vgreenRes,
    previous
      ? {
          vndPerKwh: previous.vgreen.vndPerKwh,
          effectiveAt: previous.vgreen.effectiveAt,
        }
      : null,
  );
  const evn = pick(
    'EVN',
    evnRes,
    previous
      ? {
          tiers: previous.evnResidential.tiers,
          representativeTier: previous.evnResidential.representativeTier,
          representativeVndPerKwh: previous.evnResidential.representativeVndPerKwh,
          source: previous.evnResidential.source,
          effectiveAt: previous.evnResidential.effectiveAt,
        }
      : null,
  );

  const out: EnergyPricesFile = {
    lastSyncedAt: new Date().toISOString(),
    petrolimex: {
      source: PETROLIMEX_URL,
      effectiveAt: petrolimex.effectiveAt,
      products: petrolimex.products,
    },
    vgreen: {
      source: VGREEN_URL,
      effectiveAt: vgreen.effectiveAt,
      vndPerKwh: vgreen.vndPerKwh,
      freeForVinFastUntil: FREE_FOR_VINFAST_UNTIL,
    },
    evnResidential: {
      source: evn.source,
      // Decision date, read from the same article the prices came from (e.g.
      // "2026-10-31" for Decision 2892/QD-BCT) — not the date the tariff takes
      // effect. Reading it from a second page let the two drift apart.
      effectiveAt: evn.effectiveAt,
      tiers: evn.tiers,
      representativeTier: evn.representativeTier,
      representativeVndPerKwh: evn.representativeVndPerKwh,
    },
  };

  writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[energy-prices] wrote ${OUTPUT}`);
  console.log(
    `  petrolimex E10 RON 95-III: ₫${petrolimex.products.ron95iii.vndPerLiter.toLocaleString('en-US')}/L`,
  );
  console.log(
    `  petrolimex DO 0,05S:   ₫${petrolimex.products.do005s.vndPerLiter.toLocaleString('en-US')}/L`,
  );
  console.log(`  vgreen:                ₫${vgreen.vndPerKwh.toLocaleString('en-US')}/kWh`);
  console.log(
    `  evn tier ${evn.representativeTier}:            ₫${evn.representativeVndPerKwh.toLocaleString('en-US')}/kWh`,
  );

  if (failedSources.length > 0) {
    console.error(
      `[energy-prices] FAILED: ${failedSources.join(', ')} reused previous values; not syncing.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[energy-prices] FATAL:', err);
  process.exit(1);
});
