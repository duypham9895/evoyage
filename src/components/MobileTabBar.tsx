'use client';

import { useLocale } from '@/lib/locale';

export type MobileTab = 'route' | 'vehicle' | 'battery';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasVehicle: boolean;
  readonly hasRoute: boolean;
}

const TABS: readonly { readonly id: MobileTab; readonly icon: string; readonly labelKey: 'tab_route' | 'tab_vehicle' | 'tab_battery' }[] = [
  { id: 'route', icon: '📍', labelKey: 'tab_route' },
  { id: 'vehicle', icon: '🚗', labelKey: 'tab_vehicle' },
  { id: 'battery', icon: '🔋', labelKey: 'tab_battery' },
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
      {TABS.map(({ id, icon, labelKey }) => {
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
            <span>{icon}</span>
            <span>{t(labelKey)}</span>
            {showDot && !isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
