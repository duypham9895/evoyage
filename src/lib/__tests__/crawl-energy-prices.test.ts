/**
 * End-to-end regression tests for scripts/crawl-energy-prices.ts.
 *
 * The script runs main() on import and exports nothing, so these tests drive
 * the whole crawl with only its external I/O mocked: `fetch` (Petrolimex,
 * V-GREEN and every EVN page) and node:fs (the previous data file and the
 * write). The assertions read what the crawl tried to write.
 *
 * Lives under src/lib/__tests__ because vitest.config.ts only includes
 * src/**\/*.test.ts, and `scripts/` is outside `tsc` as well — so without this
 * file the crawl's own control flow has no gate at all. Same shape as
 * crawl-vinfast-stations.test.ts.
 *
 * Every EVN page is served from a committed fixture except the three listed
 * articles no fixture was captured for; those are clearly-labelled synthetic
 * stubs whose only job is to not look like a residential tariff.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/__fixtures__/energy-prices',
);

const state = vi.hoisted(() => ({
  // url -> body, or an Error to reject with, or a number to answer as an HTTP status
  routes: new Map<string, string | Error | number>(),
  previousJson: null as string | null,
  written: null as string | null,
  exitCalls: [] as number[],
  requested: [] as string[],
  settle: () => {},
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const isOutput = (p: unknown) => String(p).endsWith('src/data/energy-prices.json');
  return {
    ...actual,
    existsSync: ((p: unknown) =>
      isOutput(p) ? state.previousJson !== null : actual.existsSync(p as string)) as typeof actual.existsSync,
    readFileSync: ((p: unknown, ...rest: unknown[]) =>
      isOutput(p) && state.previousJson !== null
        ? state.previousJson
        : (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest)) as typeof actual.readFileSync,
    writeFileSync: ((p: unknown, data: unknown, ...rest: unknown[]) => {
      if (isOutput(p)) {
        state.written = String(data);
        state.settle();
        return;
      }
      (actual.writeFileSync as (...a: unknown[]) => unknown)(p, data, ...rest);
    }) as typeof actual.writeFileSync,
  };
});

const fixture = (name: string) => readFileSync(resolve(FIXTURE_DIR, name), 'utf8');

/** SYNTHETIC — not a captured fixture. Stands in for a listed EVN article that
 *  is not a residential tariff, so discovery must reject it. */
const syntheticNonResidential = (title: string) =>
  `<!-- SYNTHETIC STUB, not a captured fixture -->` +
  `<html><head><title>${title}</title>` +
  `<meta property="og:title" content="${title}" /></head>` +
  `<body><p>This article carries no residential tariff table.</p></body></html>`;

const EVN = {
  listing: 'https://en.evn.com.vn/en-US/news-l/Electricity-Tariff-60-28',
  retail:
    'https://en.evn.com.vn/d/en-US/news/Retail-Electricity-Tariffs-by-Customer-Categories-Decision-No-2892QD-BCT-dated-October-31-2026-issued-by-Ministry-of-Industry-and-Trade-60-28-501776',
  reseller:
    'https://en.evn.com.vn/d/en-US/news/Electricity-Selling-Prices-for-Electricity-Retailers-Under-Decision-No-2892QD-BCT-dated-October-31-2026-issued-by-Ministry-of-Industry-and-Trade--60-28-252',
  decision:
    'https://en.evn.com.vn/d/en-US/news/Ministry-of-Industry-and-Trade-Decision-No-2892QD-BCT-dated-October-31-2026-on-Electricity-Tariffs-60-28-501775',
  avgPrice:
    'https://en.evn.com.vn/d/en-US/news/EVN-Decision-No-1305QD-EVN-dated-October-30-2026-on-adjustment-of-average-retail-electricity-price-60-28-501774',
  wholesale:
    'https://en.evn.com.vn/d/en-US/news/WHOLESALE-ELECTRICITY-TARIFF-Decision-No-1279QD-BCT-dated-9-May-2025-of-Ministry-of-Industry-and-Trade-60-28-260',
} as const;

const PETROLIMEX_HOST = 'portals.petrolimex.com.vn';
const VGREEN_URL = 'https://vgreen.net/vi/cau-hoi-thuong-gap';

/** The values the committed fixtures parse to — the crawl's expected output. */
const EXPECTED = {
  ron95iii: 24150,
  do005s: 30240,
  petrolimexEffectiveAt: '2026-10-31T16:54:47.264Z',
  vgreenVndPerKwh: 3858,
  vgreenEffectiveAt: '2024-03-19',
  evnTiers: [1901, 2289, 2894, 3456, 3844],
  evnRepresentativeTier: 3,
  evnRepresentativeVndPerKwh: 2894,
  evnEffectiveAt: '2026-10-31',
} as const;

const PREVIOUS = {
  lastSyncedAt: '2026-11-01T00:00:00.000Z',
  petrolimex: {
    source: 'https://www.petrolimex.com.vn/index.html',
    effectiveAt: '2026-10-01T00:00:00.000Z',
    products: {
      ron95iii: { label: 'Xăng E10 RON 95-III', vndPerLiter: 11111 },
      do005s: { label: 'DO 0,05S-II', vndPerLiter: 22222 },
    },
  },
  vgreen: {
    source: VGREEN_URL,
    effectiveAt: '2024-03-19',
    vndPerKwh: 3333,
    freeForVinFastUntil: '2029-12-31',
  },
  evnResidential: {
    source: 'https://en.evn.com.vn/d/en-US/news/previous-60-28-501776',
    effectiveAt: '2025-05-09',
    tiers: [
      { minKwh: 0, maxKwh: 100, vndPerKwh: 1001 },
      { minKwh: 101, maxKwh: 200, vndPerKwh: 2002 },
      { minKwh: 201, maxKwh: null, vndPerKwh: 3003 },
    ],
    representativeTier: 3,
    representativeVndPerKwh: 3003,
  },
};

function defaultRoutes(): Map<string, string | Error | number> {
  const petrolimex = JSON.parse(fixture('petrolimex-2026-10-31.json')) as {
    products: unknown[];
  };
  return new Map<string, string | Error | number>([
    [PETROLIMEX_HOST, JSON.stringify({ Objects: petrolimex.products })],
    [VGREEN_URL, fixture('vgreen-faq.html')],
    [EVN.listing, fixture('evn-listing.html')],
    [EVN.retail, fixture('evn-tariff-2892.html')],
    [EVN.reseller, fixture('evn-reseller-2892.html')],
    [
      EVN.decision,
      syntheticNonResidential(
        'Ministry of Industry and Trade Decision No. 2892/QD-BCT dated October 31, 2026 on Electricity Tariffs',
      ),
    ],
    [
      EVN.avgPrice,
      syntheticNonResidential(
        'EVN Decision No. 1305/QD-EVN dated October 30, 2026 on adjustment of average retail electricity price',
      ),
    ],
    [
      EVN.wholesale,
      syntheticNonResidential(
        'WHOLESALE ELECTRICITY TARIFF (Decision No. 1279/QD-BCT dated 9 May 2025 of Ministry of Industry and Trade)',
      ),
    ],
  ]);
}

function route(url: string): string | Error | number | undefined {
  if (url.includes(PETROLIMEX_HOST)) return state.routes.get(PETROLIMEX_HOST);
  return state.routes.get(url);
}

interface CrawlResult {
  readonly written: Record<string, never> | null;
  readonly exitCode: number | undefined;
  readonly exitCalls: readonly number[];
}

async function runCrawl(): Promise<CrawlResult> {
  const done = new Promise<void>((resolve) => {
    state.settle = resolve;
  });
  vi.resetModules();
  await import('../../../scripts/crawl-energy-prices');
  await Promise.race([
    done,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('HARNESS: crawl never wrote or exited')), 20_000),
    ),
  ]);
  // Let main()'s synchronous tail (process.exitCode) and its .catch settle.
  await new Promise((r) => setTimeout(r, 0));
  return {
    written: state.written === null ? null : JSON.parse(state.written),
    exitCode: process.exitCode as number | undefined,
    exitCalls: [...state.exitCalls],
  };
}

let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  originalExitCode = process.exitCode;
  state.routes = defaultRoutes();
  state.previousJson = JSON.stringify(PREVIOUS);
  state.written = null;
  state.exitCalls = [];
  state.requested = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    state.exitCalls.push(code ?? 0);
    state.settle();
    return undefined as never;
  }) as never);
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = String(input);
    state.requested.push(url);
    const answer = route(url);
    if (answer === undefined) throw new Error(`HARNESS: no route for ${url}`);
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') {
      return { ok: false, status: answer, async text() { return ''; }, async json() { return {}; } };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return answer;
      },
      async json() {
        return JSON.parse(answer);
      },
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = originalExitCode;
});

type Written = {
  lastSyncedAt: string;
  petrolimex: { source: string; effectiveAt: string; products: Record<string, { vndPerLiter: number }> };
  vgreen: { vndPerKwh: number; effectiveAt: string; freeForVinFastUntil: string };
  evnResidential: {
    source: string;
    effectiveAt: string;
    tiers: { minKwh: number; maxKwh: number | null; vndPerKwh: number }[];
    representativeTier: number;
    representativeVndPerKwh: number;
  };
};

describe('crawl-energy-prices: happy path', () => {
  it('writes every source fresh and exits 0', async () => {
    const { written, exitCode, exitCalls } = await runCrawl();
    const out = written as unknown as Written;

    expect(out.evnResidential.tiers.map((t) => t.vndPerKwh)).toEqual([...EXPECTED.evnTiers]);
    expect(out.evnResidential.representativeTier).toBe(EXPECTED.evnRepresentativeTier);
    expect(out.evnResidential.representativeVndPerKwh).toBe(
      EXPECTED.evnRepresentativeVndPerKwh,
    );
    expect(out.evnResidential.effectiveAt).toBe(EXPECTED.evnEffectiveAt);
    expect(out.evnResidential.source).toBe(EVN.retail);

    expect(out.petrolimex.products.ron95iii.vndPerLiter).toBe(EXPECTED.ron95iii);
    expect(out.petrolimex.products.do005s.vndPerLiter).toBe(EXPECTED.do005s);
    expect(out.petrolimex.effectiveAt).toBe(EXPECTED.petrolimexEffectiveAt);
    expect(out.vgreen.vndPerKwh).toBe(EXPECTED.vgreenVndPerKwh);
    expect(out.vgreen.effectiveAt).toBe(EXPECTED.vgreenEffectiveAt);

    expect(Number.isNaN(Date.parse(out.lastSyncedAt))).toBe(false);
    expect(exitCode).toBeFalsy();
    expect(exitCalls).toEqual([]);
  }, 20_000);

  it('reads the chosen article from the listing rather than a hardcoded URL', async () => {
    await runCrawl();
    expect(state.requested).toContain(EVN.listing);
    expect(state.requested).toContain(EVN.retail);
  }, 20_000);
});

describe('crawl-energy-prices: a failed source keeps its previous values and reds the run', () => {
  // R1-code-HIGH: a tolerated article fetch failure shrank the candidate set,
  // and a smaller set is how an older decision wins. Every listed article must
  // be fetched, with one retry; two failures fail the EVN source.
  it('R1-code-HIGH: fails EVN when one article fetch fails twice, keeping the previous EVN block', async () => {
    state.routes.set(EVN.retail, new Error('ECONNRESET'));

    const { written, exitCode } = await runCrawl();
    const out = written as unknown as Written;

    expect(out.evnResidential.source).toBe(PREVIOUS.evnResidential.source);
    expect(out.evnResidential.effectiveAt).toBe(PREVIOUS.evnResidential.effectiveAt);
    expect(out.evnResidential.representativeVndPerKwh).toBe(
      PREVIOUS.evnResidential.representativeVndPerKwh,
    );
    // The other two sources were fetched fine and are still written fresh.
    expect(out.petrolimex.products.ron95iii.vndPerLiter).toBe(EXPECTED.ron95iii);
    expect(out.vgreen.vndPerKwh).toBe(EXPECTED.vgreenVndPerKwh);
    expect(exitCode).toBe(1);
  }, 20_000);

  it('SPEC-TRAP: fails loudly when the listing offers only the reseller article', async () => {
    state.routes.set(
      EVN.listing,
      `<html><body><a href="${EVN.reseller}">reseller</a></body></html>`,
    );

    const { written, exitCode } = await runCrawl();
    const out = written as unknown as Written;

    expect(out.evnResidential.representativeVndPerKwh).toBe(
      PREVIOUS.evnResidential.representativeVndPerKwh,
    );
    expect(exitCode).toBe(1);
  }, 20_000);

  // R1-H1b: the freshness floor, exercised through the script that calls it.
  it('R1-H1b: fails EVN when the chosen decision predates the published one', async () => {
    state.previousJson = JSON.stringify({
      ...PREVIOUS,
      evnResidential: { ...PREVIOUS.evnResidential, effectiveAt: '2027-01-01' },
    });

    const { written, exitCode } = await runCrawl();
    const out = written as unknown as Written;

    expect(out.evnResidential.effectiveAt).toBe('2027-01-01');
    expect(out.evnResidential.representativeVndPerKwh).toBe(
      PREVIOUS.evnResidential.representativeVndPerKwh,
    );
    expect(exitCode).toBe(1);
  }, 20_000);

  it('fails Petrolimex when the feed no longer carries the required product', async () => {
    state.routes.set(PETROLIMEX_HOST, JSON.stringify({ Objects: [] }));

    const { written, exitCode } = await runCrawl();
    const out = written as unknown as Written;

    expect(out.petrolimex.products.ron95iii.vndPerLiter).toBe(
      PREVIOUS.petrolimex.products.ron95iii.vndPerLiter,
    );
    // EVN still published fresh: one failed source must not corrupt the others.
    expect(out.evnResidential.representativeVndPerKwh).toBe(
      EXPECTED.evnRepresentativeVndPerKwh,
    );
    expect(exitCode).toBe(1);
  }, 20_000);
});

describe('crawl-energy-prices: no previous file', () => {
  it('takes the FATAL path rather than writing a half-empty file', async () => {
    state.previousJson = null;
    state.routes.set(EVN.listing, new Error('ENOTFOUND'));

    const { written, exitCalls } = await runCrawl();

    expect(written).toBeNull();
    expect(exitCalls).toContain(1);
  }, 20_000);
});
