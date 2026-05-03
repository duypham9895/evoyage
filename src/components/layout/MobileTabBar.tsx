'use client';

import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';

export type MobileTab = 'route' | 'vehicle' | 'battery' | 'stations';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasVehicle: boolean;
  readonly hasRoute: boolean;
}

const TABS = [
  { id: 'route' as const, labelKey: 'tab_route' as const },
  { id: 'vehicle' as const, labelKey: 'tab_vehicle' as const },
  { id: 'battery' as const, labelKey: 'tab_battery' as const },
  { id: 'stations' as const, labelKey: 'tab_stations' as const },
] as const;

export default function MobileTabBar({
  activeTab,
  onTabChange,
  hasVehicle,
  hasRoute,
}: MobileTabBarProps) {
  const { t } = useLocale();

  return (
    <div
      className="flex p-0.5 bg-[var(--color-background)] rounded-xl mb-1"
      role="tablist"
      aria-label="Trip planner tabs"
    >
      {TABS.map(({ id, labelKey }) => {
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
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] transition-colors whitespace-nowrap min-h-[40px] ${
              isActive
                ? 'text-[var(--color-foreground)] font-semibold border-b-2 border-[var(--color-accent)]'
                : 'text-[var(--color-muted)] font-medium border-b-2 border-transparent hover:text-[var(--color-foreground)]'
            }`}
          >
            {t(labelKey)}
            {showDot && !isActive && (
              <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
