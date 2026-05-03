// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileTabBar from './MobileTabBar';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

let mockLocale: 'vi' | 'en' = 'vi';
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocale,
    t: (key: string) => (dicts[mockLocale] as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

describe('MobileTabBar', () => {
  beforeEach(() => {
    mockLocale = 'vi';
    vi.clearAllMocks();
  });

  it('renders exactly 4 tabs (no eVi)', () => {
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    const labels = tabs.map(t => t.textContent?.trim());
    expect(labels).toEqual(['Tuyến đường', 'Xe', 'Pin', 'Trạm sạc']);
  });

  it('does not render an eVi tab', () => {
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    expect(screen.queryByRole('tab', { name: /eVi/i })).toBeNull();
  });

  it('marks the active tab with aria-selected and accent underline class', () => {
    render(
      <MobileTabBar
        activeTab="vehicle"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const active = screen.getByRole('tab', { selected: true });
    expect(active.textContent?.trim()).toBe('Xe');
    expect(active.className).toMatch(/border-b-2/);
  });

  it('uses flex-1 layout (no horizontal scroll)', () => {
    const { container } = render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list?.className).not.toMatch(/overflow-x-auto/);
    const firstTab = screen.getAllByRole('tab')[0];
    expect(firstTab.className).toMatch(/flex-1/);
  });

  it('calls onTabChange with the right tab id when clicked', () => {
    const onTabChange = vi.fn();
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={onTabChange}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pin' }));
    expect(onTabChange).toHaveBeenCalledWith('battery');
  });

  it('shows notification dot on route tab when hasRoute=true and not active', () => {
    const { container } = render(
      <MobileTabBar
        activeTab="vehicle"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={true}
      />,
    );
    const routeTab = screen.getByRole('tab', { name: /Tuyến đường/ });
    expect(routeTab.querySelector('span.rounded-full')).toBeInTheDocument();
    const vehicleTab = container.querySelector('[aria-selected="true"]');
    expect(vehicleTab?.querySelector('span.rounded-full')).toBeNull();
  });
});
