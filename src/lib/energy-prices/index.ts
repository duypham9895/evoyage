/**
 * Public API for the auto-crawled energy-prices data file.
 *
 * `src/data/energy-prices.json` is rewritten daily by
 * `scripts/crawl-energy-prices.ts` (run on GitHub Actions). Consumers
 * (homepage, README updater, trip-cost panel) read through this module so we
 * have one typed entry point and never duplicate field names.
 */
import data from '@/data/energy-prices.json';

export interface EnergyPricesSnapshot {
  readonly lastSyncedAt: string;
  readonly petrolimex: {
    readonly source: string;
    readonly effectiveAt: string;
    readonly products: Readonly<
      Record<string, { readonly label: string; readonly vndPerLiter: number }>
    >;
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
    readonly tiers: ReadonlyArray<{
      readonly minKwh: number;
      readonly maxKwh: number | null;
      readonly vndPerKwh: number;
    }>;
    readonly representativeTier: number;
    readonly representativeVndPerKwh: number;
  };
}

export function getEnergyPrices(): EnergyPricesSnapshot {
  return data as EnergyPricesSnapshot;
}

/** Headline gasoline price (RON 95-III, the typical pump grade). */
export function getGasolineVndPerLiter(snapshot = getEnergyPrices()): number {
  const ron95iii = snapshot.petrolimex.products.ron95iii;
  if (!ron95iii) {
    throw new Error('energy-prices: RON 95-III missing from petrolimex.products');
  }
  return ron95iii.vndPerLiter;
}

/** Headline diesel price (DO 0,05S, the typical pump grade). */
export function getDieselVndPerLiter(snapshot = getEnergyPrices()): number {
  const do005s = snapshot.petrolimex.products.do005s;
  if (!do005s) {
    throw new Error('energy-prices: DO 0,05S missing from petrolimex.products');
  }
  return do005s.vndPerLiter;
}
