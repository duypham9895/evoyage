// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import HomeEnergyPrices from './HomeEnergyPrices';
import type { EnergyPricesSnapshot } from '@/lib/energy-prices';

const SNAPSHOT: EnergyPricesSnapshot = {
  lastSyncedAt: '2026-05-01T03:00:00.000Z',
  petrolimex: {
    source: 'https://www.petrolimex.com.vn/index.html',
    effectiveAt: '2026-04-29T08:00:08.000Z',
    products: {
      ron95iii: { label: 'Xăng RON 95-III', vndPerLiter: 23_750 },
      do005s: { label: 'DO 0,05S-II', vndPerLiter: 28_170 },
    },
  },
  vgreen: {
    source: 'https://vgreen.net/vi/cau-hoi-thuong-gap',
    effectiveAt: '2024-03-19',
    vndPerKwh: 3_858,
    freeForVinFastUntil: '2029-12-31',
  },
  evnResidential: {
    source: 'https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx',
    effectiveAt: '2025-05-09',
    tiers: [],
    representativeTier: 4,
    representativeVndPerKwh: 2_998,
  },
};

const t = (key: string, params?: Record<string, string | number>) => {
  if (params && 'date' in params && key === 'landing_prices_freshness') {
    return `Updated · ${params.date}`;
  }
  return key;
};

describe('HomeEnergyPrices', () => {
  it('renders the section heading', () => {
    render(<HomeEnergyPrices snapshot={SNAPSHOT} t={t} locale="en" />);
    expect(screen.getByText('landing_prices_heading')).toBeInTheDocument();
  });

  it('renders all four price rows with formatted values', () => {
    render(<HomeEnergyPrices snapshot={SNAPSHOT} t={t} locale="en" />);
    // Gasoline
    expect(screen.getByText('landing_prices_gasoline')).toBeInTheDocument();
    expect(screen.getByText(/23,750/)).toBeInTheDocument();
    // Diesel
    expect(screen.getByText('landing_prices_diesel')).toBeInTheDocument();
    expect(screen.getByText(/28,170/)).toBeInTheDocument();
    // EVN home
    expect(screen.getByText('landing_prices_electric_home')).toBeInTheDocument();
    expect(screen.getByText(/2,998/)).toBeInTheDocument();
    // V-GREEN
    expect(screen.getByText('landing_prices_vgreen')).toBeInTheDocument();
    expect(screen.getByText(/3,858/)).toBeInTheDocument();
  });

  it('formats numbers with vi locale (dot separator)', () => {
    render(<HomeEnergyPrices snapshot={SNAPSHOT} t={t} locale="vi" />);
    expect(screen.getByText(/23\.750/)).toBeInTheDocument();
    expect(screen.getByText(/3\.858/)).toBeInTheDocument();
  });

  it('renders the freshness caption with the last-sync date', () => {
    render(<HomeEnergyPrices snapshot={SNAPSHOT} t={t} locale="en" />);
    expect(screen.getByText(/Updated · /)).toBeInTheDocument();
  });

  it('renders the captions for EVN tier and V-GREEN free policy', () => {
    render(<HomeEnergyPrices snapshot={SNAPSHOT} t={t} locale="en" />);
    expect(
      screen.getByText('landing_prices_electric_home_caption'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('landing_prices_vgreen_caption'),
    ).toBeInTheDocument();
  });
});
