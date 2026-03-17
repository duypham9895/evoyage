'use client';

import { useLocale } from '@/lib/locale';

interface TripInputProps {
  readonly start: string;
  readonly end: string;
  readonly onStartChange: (value: string) => void;
  readonly onEndChange: (value: string) => void;
  readonly isLoaded: boolean;
}

export default function TripInput({
  start,
  end,
  onStartChange,
  onEndChange,
}: TripInputProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {t('Hành trình', 'Trip Route')}
      </h2>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-[var(--color-muted)] mb-1 block">
            {t('Điểm xuất phát', 'Starting point')}
          </label>
          <input
            type="text"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            placeholder={t('VD: Hồ Chí Minh', 'e.g., Ho Chi Minh City')}
            className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-muted)]"
          />
        </div>

        <div className="flex justify-center">
          <div className="w-px h-4 bg-[var(--color-surface-hover)]" />
        </div>

        <div>
          <label className="text-xs text-[var(--color-muted)] mb-1 block">
            {t('Điểm đến', 'Destination')}
          </label>
          <input
            type="text"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
            placeholder={t('VD: Nha Trang', 'e.g., Nha Trang')}
            className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-muted)]"
          />
        </div>
      </div>
    </div>
  );
}