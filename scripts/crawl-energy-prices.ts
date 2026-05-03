/**
 * Crawl Vietnam fuel + electricity prices from authoritative public sources.
 *
 * Sources:
 *   - Petrolimex homepage  → gas + diesel retail prices (Zone 1)
 *   - V-GREEN FAQ          → public charging rate (VND/kWh)
 *   - EVN English tariff   → residential 6-tier electricity tariff
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
  parseEvnTariff,
  parseEvnDecisionDate,
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
const EVN_URL = 'https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx';
const EVN_DECISIONS_URL = 'https://www.evn.com.vn/c3/gia-dien/Bieu-gia-ban-le-dien-9-28.aspx';

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
  readonly effectiveAt: string | null;
}

async function fetchEvn(): Promise<EvnResult> {
  const [tariffRes, decisionsRes] = await Promise.all([
    fetch(EVN_URL, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } }),
    fetch(EVN_DECISIONS_URL, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }),
  ]);
  if (!tariffRes.ok) throw new Error(`EVN tariff fetch failed: HTTP ${tariffRes.status}`);
  const tariff = parseEvnTariff(await tariffRes.text());
  // Decisions page is best-effort — if it fails, fall back to null and let the
  // caller carry over the previous effectiveAt.
  let effectiveAt: string | null = null;
  if (decisionsRes.ok) {
    effectiveAt = parseEvnDecisionDate(await decisionsRes.text());
  } else {
    console.warn(
      `[energy-prices] EVN decisions page returned HTTP ${decisionsRes.status}, skipping date detection`,
    );
  }
  return { ...tariff, effectiveAt };
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

  const results = await Promise.allSettled([fetchPetrolimex(), fetchVGreen(), fetchEvn()]);
  const [petrolimexRes, vgreenRes, evnRes] = results;

  // If a source fails, fall back to its previous value rather than crashing the
  // whole crawler. We still log loudly so a human notices the failure.
  function pick<T>(label: string, res: PromiseSettledResult<T>, fallback: T | null): T {
    if (res.status === 'fulfilled') return res.value;
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
          effectiveAt: previous.evnResidential.effectiveAt || null,
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
      source: EVN_URL,
      // The English tariff page doesn't expose a Decision date. We fetch the
      // Vietnamese decisions page in parallel and pull the latest QĐ-BCT date.
      // If both pages succeeded, this is the regulator's official effective
      // date (e.g. "2025-05-09" for Decision 1279/QĐ-BCT). If the decisions
      // page failed, we carry over the previous JSON's value rather than blank.
      effectiveAt:
        evn.effectiveAt ??
        previous?.evnResidential.effectiveAt ??
        '',
      tiers: evn.tiers,
      representativeTier: evn.representativeTier,
      representativeVndPerKwh: evn.representativeVndPerKwh,
    },
  };

  writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[energy-prices] wrote ${OUTPUT}`);
  console.log(
    `  petrolimex RON 95-III: ₫${petrolimex.products.ron95iii.vndPerLiter.toLocaleString('en-US')}/L`,
  );
  console.log(
    `  petrolimex DO 0,05S:   ₫${petrolimex.products.do005s.vndPerLiter.toLocaleString('en-US')}/L`,
  );
  console.log(`  vgreen:                ₫${vgreen.vndPerKwh.toLocaleString('en-US')}/kWh`);
  console.log(
    `  evn tier 4:            ₫${evn.representativeVndPerKwh.toLocaleString('en-US')}/kWh`,
  );
}

main().catch((err) => {
  console.error('[energy-prices] FATAL:', err);
  process.exit(1);
});
