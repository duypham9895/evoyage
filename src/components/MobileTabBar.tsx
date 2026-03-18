'use client';

import { useLocale } from '@/lib/locale';

export type MobileTab = 'route' | 'vehicle' | 'battery';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasVehicle: boolean;
  readonly hasRoute: boolean;
}

const TABS: readonly { readonly id: MobileTab; readonly iconVi: string; readonly iconEn: string; readonly labelVi: string; readonly labelEn: string }[] = [
  { id: 'route', iconVi: '📍', iconEn: '📍', labelVi: 'Hành trình', labelEn: 'Route' },
  { id: 'vehicle', iconVi: '🚗', iconEn: '🚗', labelVi: 'Xe', labelEn: 'Vehicle' },
  { id: 'battery', iconVi: '🔋', iconEn: '🔋', labelVi: 'Pin', labelEn: 'Battery' },
];

export default function MobileTabBar({
  activeTab,
  onTabChange,
  hasVehicle,
  hasRoute,
}: MobileTabBarProps) {
  const { t } = useLocale();

  return (
    <div className="flex gap-1 p-1 bg-[var(--color-background)] rounded-xl mb-3">
      {TABS.map(({ id, iconVi, iconEn, labelVi, labelEn }) => {
        const isActive = activeTab === id;
        const showDot =
          (id === 'route' && hasRoute) ||
          (id === 'vehicle' && hasVehicle);

        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold shadow-sm'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
          >
            <span>{t(iconVi, iconEn)}</span>
            <span>{t(labelVi, labelEn)}</span>
            {showDot && !isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
