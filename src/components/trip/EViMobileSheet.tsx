'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';
import EVi from '@/components/EVi';
import type { EViTripParams } from '@/lib/evi/types';

interface EViMobileSheetProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onTripParsed: (params: EViTripParams) => void;
  readonly onPlanTrip: (params: EViTripParams) => void;
  readonly onFindNearbyStations: () => void;
  readonly isPlanning: boolean;
}

export default function EViMobileSheet({
  isOpen,
  onClose,
  onTripParsed,
  onPlanTrip,
  onFindNearbyStations,
  isPlanning,
}: EViMobileSheetProps) {
  const { t } = useLocale();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('evi_sheet_title')}
      className={`${isOpen ? 'flex' : 'hidden'} fixed inset-0 z-[800] flex-col bg-[var(--color-surface)] lg:hidden`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-surface-hover)] min-h-[52px]">
        <h2 className="font-[family-name:var(--font-heading)] font-semibold text-base text-[var(--color-foreground)]">
          {t('evi_sheet_title')}
        </h2>
        <button
          type="button"
          onClick={() => { hapticLight(); onClose(); }}
          aria-label={t('evi_sheet_close')}
          className="px-3 py-1.5 rounded-md text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {t('evi_sheet_close')}
        </button>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">
        <EVi
          onTripParsed={onTripParsed}
          onPlanTrip={onPlanTrip}
          onFindNearbyStations={onFindNearbyStations}
          isPlanning={isPlanning}
        />
      </div>
    </div>
  );
}
