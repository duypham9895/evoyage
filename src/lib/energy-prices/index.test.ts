import { describe, it, expect } from 'vitest';
import {
  getEnergyPrices,
  getGasolineVndPerLiter,
  getDieselVndPerLiter,
} from './index';

describe('getEnergyPrices', () => {
  it('returns a typed snapshot with all three sources populated', () => {
    const snap = getEnergyPrices();
    expect(typeof snap.lastSyncedAt).toBe('string');
    expect(snap.petrolimex.source).toMatch(/petrolimex\.com\.vn/);
    expect(snap.vgreen.source).toMatch(/vgreen\.net/);
    expect(snap.evnResidential.source).toMatch(/evn\.com\.vn/);
  });

  it('exposes Petrolimex products with positive prices', () => {
    const { products } = getEnergyPrices().petrolimex;
    expect(Object.keys(products).length).toBeGreaterThanOrEqual(2);
    for (const product of Object.values(products)) {
      expect(product.vndPerLiter).toBeGreaterThan(0);
      expect(typeof product.label).toBe('string');
    }
  });

  it('exposes V-GREEN rate with the free-for-VinFast horizon', () => {
    const { vgreen } = getEnergyPrices();
    expect(vgreen.vndPerKwh).toBeGreaterThan(0);
    expect(vgreen.freeForVinFastUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('exposes EVN tier 4 as the representative residential rate', () => {
    const { evnResidential } = getEnergyPrices();
    expect(evnResidential.representativeTier).toBe(4);
    expect(evnResidential.representativeVndPerKwh).toBe(
      evnResidential.tiers[3].vndPerKwh,
    );
  });
});

describe('getGasolineVndPerLiter', () => {
  it('returns the RON 95-III price when present', () => {
    const fakeSnap = {
      lastSyncedAt: 'x',
      petrolimex: {
        source: '',
        effectiveAt: '',
        products: { ron95iii: { label: 'X', vndPerLiter: 23750 } },
      },
      vgreen: { source: '', effectiveAt: '', vndPerKwh: 0, freeForVinFastUntil: '' },
      evnResidential: {
        source: '',
        effectiveAt: '',
        tiers: [],
        representativeTier: 4,
        representativeVndPerKwh: 0,
      },
    } as const;
    expect(getGasolineVndPerLiter(fakeSnap)).toBe(23750);
  });

  it('throws when RON 95-III is missing from the snapshot', () => {
    const broken = {
      lastSyncedAt: '',
      petrolimex: { source: '', effectiveAt: '', products: {} },
      vgreen: { source: '', effectiveAt: '', vndPerKwh: 0, freeForVinFastUntil: '' },
      evnResidential: {
        source: '',
        effectiveAt: '',
        tiers: [],
        representativeTier: 4,
        representativeVndPerKwh: 0,
      },
    } as const;
    expect(() => getGasolineVndPerLiter(broken)).toThrow(/RON 95-III/);
  });
});

describe('getDieselVndPerLiter', () => {
  it('returns the DO 0,05S price when present', () => {
    const fakeSnap = {
      lastSyncedAt: 'x',
      petrolimex: {
        source: '',
        effectiveAt: '',
        products: { do005s: { label: 'X', vndPerLiter: 28170 } },
      },
      vgreen: { source: '', effectiveAt: '', vndPerKwh: 0, freeForVinFastUntil: '' },
      evnResidential: {
        source: '',
        effectiveAt: '',
        tiers: [],
        representativeTier: 4,
        representativeVndPerKwh: 0,
      },
    } as const;
    expect(getDieselVndPerLiter(fakeSnap)).toBe(28170);
  });

  it('throws when DO 0,05S is missing', () => {
    const broken = {
      lastSyncedAt: '',
      petrolimex: { source: '', effectiveAt: '', products: {} },
      vgreen: { source: '', effectiveAt: '', vndPerKwh: 0, freeForVinFastUntil: '' },
      evnResidential: {
        source: '',
        effectiveAt: '',
        tiers: [],
        representativeTier: 4,
        representativeVndPerKwh: 0,
      },
    } as const;
    expect(() => getDieselVndPerLiter(broken)).toThrow(/DO 0,05S/);
  });
});
