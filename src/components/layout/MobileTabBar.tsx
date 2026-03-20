'use client';

import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';

export type MobileTab = 'evi' | 'route' | 'vehicle' | 'battery';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasVehicle: boolean;
  readonly hasRoute: boolean;
}

const TABS = [
  { id: 'evi' as const, icon: '🧭', labelKey: 'tab_evi' as const },
  { id: 'route' as const, icon: '📍', labelKey: 'tab_route' as const },
  { id: 'vehicle' as const, icon: '🚗', labelKey: 'tab_vehicle' as const },
  { id: 'battery' as const, icon: '🔋', labelKey: 'tab_battery' as const },
] as const;

export default function MobileTabBar({
  activeTab,
  onTabChange,
  hasVehicle,
  hasRoute,
}: MobileTabBarProps) {
  const { t } = useLocale();

  return (
    <div className="flex gap-1 p-1 bg-[var(--color-background)] rounded-xl mb-3" role="tablist" aria-label="Trip planner tabs">
      {TABS.map(({ id, icon, labelKey }) => {
        const isActive = activeTab === id;
        const showDot =
          (id === 'route' && hasRoute) ||
          (id === 'vehicle' && hasVehicle);

        return (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${id}`}
            onClick={() => { hapticLight(); onTabChange(id); }}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap overflow-hidden ${
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
