// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import DesktopTabBar from './DesktopTabBar';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string) => {
      const labels: Record<string, string> = {
        desktop_tab_evi: 'eVi',
        desktop_tab_plan: 'Plan Trip',
        desktop_tab_stations: 'Stations',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

// jsdom stub for haptics (uses window.matchMedia)
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockReturnValue({ matches: false }),
  writable: true,
});

describe('DesktopTabBar', () => {
  const onTabChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 3 tab buttons with correct labels', () => {
    render(<DesktopTabBar activeTab="evi" onTabChange={onTabChange} />);
    expect(screen.getByText('eVi')).toBeInTheDocument();
    expect(screen.getByText('Plan Trip')).toBeInTheDocument();
    expect(screen.getByText('Stations')).toBeInTheDocument();
  });

  it('applies active styling to the selected tab', () => {
    render(<DesktopTabBar activeTab="stations" onTabChange={onTabChange} />);
    const stationsTab = screen.getByText('Stations');
    expect(stationsTab).toHaveAttribute('aria-selected', 'true');

    const eviTab = screen.getByText('eVi');
    expect(eviTab).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onTabChange when a tab is clicked', () => {
    render(<DesktopTabBar activeTab="evi" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Stations'));
    expect(onTabChange).toHaveBeenCalledWith('stations');
  });

  it('has correct ARIA roles and attributes', () => {
    render(<DesktopTabBar activeTab="planTrip" onTabChange={onTabChange} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    // Active tab should have tabindex 0, inactive tabs -1
    const planTab = screen.getByText('Plan Trip');
    expect(planTab).toHaveAttribute('tabindex', '0');
    const eviTab = screen.getByText('eVi');
    expect(eviTab).toHaveAttribute('tabindex', '-1');
  });

  it('navigates tabs with arrow keys', () => {
    render(<DesktopTabBar activeTab="evi" onTabChange={onTabChange} />);
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('planTrip');

    onTabChange.mockClear();
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onTabChange).toHaveBeenCalledWith('stations');
  });

  it('wraps around on arrow key at edges', () => {
    render(<DesktopTabBar activeTab="stations" onTabChange={onTabChange} />);
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('evi');
  });
});
