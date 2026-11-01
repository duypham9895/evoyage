// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileTabBar from './MobileTabBar';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';
import { AA_NORMAL_TEXT, contrastRatio, textColorToken, tokenHex } from '@/lib/__tests__/wcag-contrast';

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

  it('renders exactly 5 tabs (route, vehicle, battery, stations, notebook)', () => {
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    const labels = tabs.map(t => t.textContent?.trim());
    expect(labels).toEqual(['Chuyến đi', 'Xe', 'Pin', 'Trạm sạc', 'Đã lưu']);
  });

  it('names the trip tab the same as the desktop trip tab in both locales', () => {
    expect(vi_dict.tab_route).toBe(vi_dict.desktop_tab_plan);
    expect(en_dict.tab_route).toBe(en_dict.desktop_tab_plan);
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

  it('calls onTabChange and hapticLight when clicked', async () => {
    const { hapticLight } = await import('@/lib/haptics');
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
    expect(hapticLight).toHaveBeenCalledTimes(1);
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
    const routeTab = screen.getByRole('tab', { name: /Chuyến đi/ });
    expect(routeTab.querySelector('span.rounded-full')).toBeInTheDocument();
    const vehicleTab = container.querySelector('[aria-selected="true"]');
    expect(vehicleTab?.querySelector('span.rounded-full')).toBeNull();
  });
  // BUG(p3-accessibility-wcag): inactive tab text uses --color-muted (#6B6B78), 3.65:1 on the background. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p3-accessibility-wcag.md
  it.fails('renders inactive tab text with at least 4.5:1 contrast on the page background (WCAG 1.4.3)', () => {
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const inactive = screen.getByRole('tab', { name: 'Xe' });
    const fg = tokenHex(textColorToken(inactive.className));
    expect(contrastRatio(fg, tokenHex('background'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
