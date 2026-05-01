import type { EnergyPricesSnapshot } from '@/lib/energy-prices';
import { formatLastUpdated } from '@/lib/station-stats';

type Locale = 'vi' | 'en';

const LOCALE_BCP47: Record<Locale, string> = {
  vi: 'vi-VN',
  en: 'en-US',
};

interface Props {
  readonly snapshot: EnergyPricesSnapshot;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly locale: Locale;
}

interface PriceRowProps {
  readonly label: string;
  readonly caption?: string;
  readonly value: string;
  readonly unit: string;
}

function PriceRow({ label, caption, value, unit }: PriceRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-[var(--color-border)] last:border-b-0">
      <div>
        <div className="text-[var(--color-foreground)] text-sm md:text-base">
          {label}
        </div>
        {caption ? (
          <div className="text-[var(--color-muted)] text-xs mt-0.5">
            {caption}
          </div>
        ) : null}
      </div>
      <div className="text-right whitespace-nowrap">
        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--color-foreground)] text-base md:text-lg">
          ₫{value}
        </span>
        <span className="text-[var(--color-muted)] text-xs ml-1">{unit}</span>
      </div>
    </div>
  );
}

export default function HomeEnergyPrices({ snapshot, t, locale }: Props) {
  const fmt = (n: number) => n.toLocaleString(LOCALE_BCP47[locale]);

  return (
    <section className="bg-[var(--color-landing-alt)] py-12 md:py-16">
      <div className="max-w-[720px] mx-auto px-6">
        <h2 className="font-[family-name:var(--font-heading)] text-xl md:text-2xl text-[var(--color-foreground)] mb-6">
          {t('landing_prices_heading')}
        </h2>

        <div className="bg-[var(--color-surface)] rounded-2xl px-5 md:px-6 py-2 border border-[var(--color-border)]">
          <PriceRow
            label={t('landing_prices_gasoline')}
            value={fmt(snapshot.petrolimex.products.ron95iii?.vndPerLiter ?? 0)}
            unit={t('landing_prices_unit_liter')}
          />
          <PriceRow
            label={t('landing_prices_diesel')}
            value={fmt(snapshot.petrolimex.products.do005s?.vndPerLiter ?? 0)}
            unit={t('landing_prices_unit_liter')}
          />
          <PriceRow
            label={t('landing_prices_electric_home')}
            caption={t('landing_prices_electric_home_caption')}
            value={fmt(snapshot.evnResidential.representativeVndPerKwh)}
            unit={t('landing_prices_unit_kwh')}
          />
          <PriceRow
            label={t('landing_prices_vgreen')}
            caption={t('landing_prices_vgreen_caption')}
            value={fmt(snapshot.vgreen.vndPerKwh)}
            unit={t('landing_prices_unit_kwh')}
          />
        </div>

        <p className="text-[var(--color-muted)] text-xs mt-4">
          {t('landing_prices_freshness', {
            date: formatLastUpdated(snapshot.lastSyncedAt, locale),
          })}
        </p>
      </div>
    </section>
  );
}
