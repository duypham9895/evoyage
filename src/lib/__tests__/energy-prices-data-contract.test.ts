/**
 * Data contract for the committed `src/data/energy-prices.json`.
 *
 * The daily crawl opens a sync PR that auto-merges once the required check
 * ("Deploy to Vercel") passes, and that check runs `npm test`. This file is
 * therefore the last gate between an implausible upstream value and
 * production: a data file that violates any rule below cannot auto-merge.
 *
 * The tier rules are NOT restated here — the test runs the parser's own
 * exported `assertTariffShape` and `findRepresentativeTier` against the file,
 * so the published data and the parser can never disagree about what is valid.
 *
 * Each rule has a paired negative test that corrupts an in-memory COPY of the
 * snapshot, proving the assertion can actually fail.
 */
import { describe, it, expect } from 'vitest';
import {
  assertTariffShape,
  findRepresentativeTier,
  REPRESENTATIVE_MONTHLY_KWH,
  type EvnTier,
} from '@/lib/energy-prices/parse-evn';
import {
  assertPlausibleVnd,
  ELECTRICITY_VND_PER_KWH_BOUNDS,
  FUEL_VND_PER_LITER_BOUNDS,
} from '@/lib/energy-prices/plausibility';
import { getEnergyPrices, type EnergyPricesSnapshot } from '@/lib/energy-prices';

const REQUIRED_FUEL_PRODUCTS = ['ron95iii', 'do005s'] as const;

const SOURCE_HOSTS: Record<'petrolimex' | 'vgreen' | 'evnResidential', string> = {
  petrolimex: 'petrolimex.com.vn',
  vgreen: 'vgreen.net',
  evnResidential: 'evn.com.vn',
};

type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

/** Deep, writable copy so a corruption never leaks into another test. */
function copy(snapshot: EnergyPricesSnapshot): DeepMutable<EnergyPricesSnapshot> {
  return JSON.parse(JSON.stringify(snapshot)) as DeepMutable<EnergyPricesSnapshot>;
}

function assertTiersValid(snapshot: EnergyPricesSnapshot): void {
  const tiers = snapshot.evnResidential.tiers as readonly EvnTier[];
  for (const tier of tiers) {
    if (!Number.isInteger(tier.minKwh)) {
      throw new Error(`energy-prices: tier minKwh ${tier.minKwh} is not an integer`);
    }
    if (tier.maxKwh !== null && !Number.isInteger(tier.maxKwh)) {
      throw new Error(`energy-prices: tier maxKwh ${tier.maxKwh} is not an integer`);
    }
    if (!Number.isInteger(tier.vndPerKwh)) {
      throw new Error(`energy-prices: tier price ${tier.vndPerKwh} is not an integer`);
    }
  }
  // Contiguity, first-min-0, open last tier, strictly ascending, plausibility.
  assertTariffShape(tiers);
}

function assertRepresentativeValid(snapshot: EnergyPricesSnapshot): void {
  const { tiers, representativeTier, representativeVndPerKwh } = snapshot.evnResidential;
  const expected = findRepresentativeTier(
    tiers as readonly EvnTier[],
    REPRESENTATIVE_MONTHLY_KWH,
  );
  if (representativeTier !== expected) {
    throw new Error(
      `energy-prices: representativeTier ${representativeTier} does not contain ${REPRESENTATIVE_MONTHLY_KWH} kWh (expected tier ${expected})`,
    );
  }
  const tier = tiers[representativeTier - 1];
  if (!tier) {
    throw new Error(`energy-prices: representativeTier ${representativeTier} indexes no tier`);
  }
  if (representativeVndPerKwh !== tier.vndPerKwh) {
    throw new Error(
      `energy-prices: representativeVndPerKwh ${representativeVndPerKwh} != tier price ${tier.vndPerKwh}`,
    );
  }
}

function assertDatesValid(snapshot: EnergyPricesSnapshot, now = new Date()): void {
  const synced = Date.parse(snapshot.lastSyncedAt);
  if (Number.isNaN(synced)) {
    throw new Error(`energy-prices: lastSyncedAt "${snapshot.lastSyncedAt}" is not a date`);
  }
  if (snapshot.lastSyncedAt !== new Date(synced).toISOString()) {
    throw new Error(`energy-prices: lastSyncedAt "${snapshot.lastSyncedAt}" is not an ISO timestamp`);
  }
  const effective: Array<[string, string]> = [
    ['petrolimex', snapshot.petrolimex.effectiveAt],
    ['vgreen', snapshot.vgreen.effectiveAt],
    ['evnResidential', snapshot.evnResidential.effectiveAt],
  ];
  for (const [label, value] of effective) {
    const at = Date.parse(value);
    if (Number.isNaN(at)) {
      throw new Error(`energy-prices: ${label}.effectiveAt "${value}" is not a real date`);
    }
    if (at > now.getTime()) {
      throw new Error(`energy-prices: ${label}.effectiveAt "${value}" is in the future`);
    }
  }
}

function assertSourcesValid(snapshot: EnergyPricesSnapshot): void {
  for (const [key, host] of Object.entries(SOURCE_HOSTS)) {
    const raw = snapshot[key as keyof typeof SOURCE_HOSTS].source;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`energy-prices: ${key}.source "${raw}" is not a URL`);
    }
    if (url.protocol !== 'https:') {
      throw new Error(`energy-prices: ${key}.source "${raw}" is not https`);
    }
    if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) {
      throw new Error(`energy-prices: ${key}.source host "${url.hostname}" is not ${host}`);
    }
  }
}

function assertFuelValid(snapshot: EnergyPricesSnapshot): void {
  for (const key of REQUIRED_FUEL_PRODUCTS) {
    const product = snapshot.petrolimex.products[key];
    if (!product) {
      throw new Error(`energy-prices: petrolimex.products.${key} is missing`);
    }
    assertPlausibleVnd(
      product.vndPerLiter,
      `energy-prices: petrolimex.products.${key}`,
      FUEL_VND_PER_LITER_BOUNDS,
    );
  }
  assertPlausibleVnd(
    snapshot.vgreen.vndPerKwh,
    'energy-prices: vgreen.vndPerKwh',
    ELECTRICITY_VND_PER_KWH_BOUNDS,
  );
}

describe('energy-prices.json: the committed data file', () => {
  const snapshot = getEnergyPrices();

  it('has a structurally valid EVN tariff', () => {
    expect(() => assertTiersValid(snapshot)).not.toThrow();
  });

  it('has a representative tier that contains the monthly kWh anchor', () => {
    expect(() => assertRepresentativeValid(snapshot)).not.toThrow();
  });

  it('has real, non-future effective dates and an ISO lastSyncedAt', () => {
    expect(() => assertDatesValid(snapshot)).not.toThrow();
  });

  it('attributes every source to its expected host over https', () => {
    expect(() => assertSourcesValid(snapshot)).not.toThrow();
  });

  it('carries every required fuel product at a plausible price', () => {
    expect(() => assertFuelValid(snapshot)).not.toThrow();
  });
});

describe('energy-prices.json: the contract rejects a corrupted file', () => {
  const snapshot = getEnergyPrices();

  it('rejects a non-integer tier bound', () => {
    const bad = copy(snapshot);
    bad.evnResidential.tiers[0].maxKwh = 100.5;
    expect(() => assertTiersValid(bad)).toThrow(/not an integer/);
  });

  it('rejects a gap between tiers', () => {
    const bad = copy(snapshot);
    bad.evnResidential.tiers[1].minKwh += 5;
    expect(() => assertTiersValid(bad)).toThrow(/not contiguous/);
  });

  it('rejects a tariff whose last tier is closed', () => {
    const bad = copy(snapshot);
    const tiers = bad.evnResidential.tiers;
    tiers[tiers.length - 1].maxKwh = 9999;
    expect(() => assertTiersValid(bad)).toThrow(/not open-ended/);
  });

  it('rejects prices that stop ascending', () => {
    const bad = copy(snapshot);
    const tiers = bad.evnResidential.tiers;
    tiers[1].vndPerKwh = tiers[0].vndPerKwh;
    expect(() => assertTiersValid(bad)).toThrow(/ascending/);
  });

  it('rejects an implausible electricity price', () => {
    const bad = copy(snapshot);
    const tiers = bad.evnResidential.tiers;
    tiers[tiers.length - 1].vndPerKwh = 999_999;
    expect(() => assertTiersValid(bad)).toThrow(/implausible VND value/);
  });

  it('rejects a representative tier that does not contain the anchor', () => {
    const bad = copy(snapshot);
    bad.evnResidential.representativeTier = 1;
    expect(() => assertRepresentativeValid(bad)).toThrow(/does not contain/);
  });

  it('rejects a representative price that is not the tier price', () => {
    const bad = copy(snapshot);
    bad.evnResidential.representativeVndPerKwh += 1;
    expect(() => assertRepresentativeValid(bad)).toThrow(/!= tier price/);
  });

  it('rejects a future effectiveAt', () => {
    const bad = copy(snapshot);
    bad.evnResidential.effectiveAt = '2099-01-01';
    expect(() => assertDatesValid(bad)).toThrow(/in the future/);
  });

  it('rejects a lastSyncedAt that is not an ISO timestamp', () => {
    const bad = copy(snapshot);
    bad.lastSyncedAt = 'yesterday';
    expect(() => assertDatesValid(bad)).toThrow(/not a date/);
  });

  it('rejects a source on the wrong host or scheme', () => {
    const offHost = copy(snapshot);
    offHost.evnResidential.source = 'https://evn.com.vn.evil.example/x';
    expect(() => assertSourcesValid(offHost)).toThrow(/is not evn\.com\.vn/);

    const insecure = copy(snapshot);
    insecure.vgreen.source = 'http://vgreen.net/vi/cau-hoi-thuong-gap';
    expect(() => assertSourcesValid(insecure)).toThrow(/is not https/);
  });

  it('rejects a missing required fuel product and an implausible fuel price', () => {
    const missing = copy(snapshot);
    delete missing.petrolimex.products.ron95iii;
    expect(() => assertFuelValid(missing)).toThrow(/ron95iii is missing/);

    const implausible = copy(snapshot);
    implausible.petrolimex.products.do005s.vndPerLiter = 0;
    expect(() => assertFuelValid(implausible)).toThrow(/implausible VND value/);
  });
});
