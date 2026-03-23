'use client';

import { useRef, useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import type { DesktopSidebarTab } from '@/hooks/useDesktopSidebarTab';

interface DesktopTabBarProps {
  readonly activeTab: DesktopSidebarTab;
  readonly onTabChange: (tab: DesktopSidebarTab) => void;
}

const TABS: readonly { readonly id: DesktopSidebarTab; readonly labelKey: string; readonly panelId: string }[] = [
  { id: 'evi', labelKey: 'desktop_tab_evi', panelId: 'desktop-tabpanel-evi' },
  { id: 'planTrip', labelKey: 'desktop_tab_plan', panelId: 'desktop-tabpanel-plan' },
  { id: 'stations', labelKey: 'desktop_tab_stations', panelId: 'desktop-tabpanel-stations' },
];

export default function DesktopTabBar({ activeTab, onTabChange }: DesktopTabBarProps) {
  const { t } = useLocale();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowLeft':
          nextIndex = currentIndex > 0 ? currentIndex - 1 : TABS.length - 1;
          break;
        case 'ArrowRight':
          nextIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = TABS.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      onTabChange(TABS[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    },
    [activeTab, onTabChange],
  );

  return (
    <div
      className="flex gap-1 px-4 pt-3 pb-0 border-b border-[var(--color-border)]"
      role="tablist"
      aria-label={t('desktop_tab_evi' as Parameters<typeof t>[0])}
      onKeyDown={handleKeyDown}
    >
      {TABS.map(({ id, labelKey, panelId }, index) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            ref={(el) => { tabRefs.current[index] = el; }}
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            id={`desktop-tab-${id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(id)}
            className={`flex-1 py-2.5 min-h-[44px] text-sm font-semibold rounded-t-lg transition-colors ${
              isActive
                ? 'bg-[var(--color-accent)] text-[var(--color-background)]'
                : 'bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {t(labelKey as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}
