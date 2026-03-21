'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';

export type MobileTab = 'evi' | 'route' | 'vehicle' | 'battery' | 'stations';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasVehicle: boolean;
  readonly hasRoute: boolean;
}

const TABS = [
  { id: 'evi' as const, labelKey: 'tab_evi' as const },
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollActiveIntoView = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeButton = container.querySelector('[aria-selected="true"]');
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

  useEffect(() => {
    scrollActiveIntoView();
  }, [activeTab, scrollActiveIntoView]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1 p-1 bg-[var(--color-background)] rounded-xl mb-3 overflow-x-auto scrollbar-hide"
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
            className={`shrink-0 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap min-h-[44px] ${
              isActive
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)]'
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
