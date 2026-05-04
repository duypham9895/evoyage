import { useState, useEffect, useCallback } from 'react';
import { hapticLight } from '@/lib/haptics';

export type DesktopSidebarTab = 'evi' | 'planTrip' | 'stations' | 'notebook';

const STORAGE_KEY = 'ev-desktop-tab';
const VALID_TABS: ReadonlySet<string> = new Set<DesktopSidebarTab>(['evi', 'planTrip', 'stations', 'notebook']);

function isValidTab(value: string): value is DesktopSidebarTab {
  return VALID_TABS.has(value);
}

export function useDesktopSidebarTab() {
  const [activeTab, setActiveTab] = useState<DesktopSidebarTab>('evi');

  // Restore from localStorage (SSR-safe — only runs on client)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration: localStorage value can't be read in SSR initializer
      if (saved && isValidTab(saved)) setActiveTab(saved);
    } catch {
      // localStorage unavailable (SSR, private browsing, etc.)
    }
  }, []);

  // Switch tab with persistence and haptic feedback
  const setTab = useCallback((tab: DesktopSidebarTab) => {
    hapticLight();
    setActiveTab(tab);
    try {
      localStorage.setItem(STORAGE_KEY, tab);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { activeTab, setTab } as const;
}
