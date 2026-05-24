// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// Mock analytics + next/navigation BEFORE importing the provider so the
// component picks up the mocks. trackPageView is a no-op in tests anyway
// (NODE_ENV !== 'production'), but mocking lets us assert it was called.
const initAnalyticsMock = vi.fn();
const trackPageViewMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock('@/lib/analytics', () => ({
  initAnalytics: () => initAnalyticsMock(),
  trackPageView: (path: string) => trackPageViewMock(path),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

// Import LAST so mocks are in place.
import AnalyticsProvider from './AnalyticsProvider';

describe('<AnalyticsProvider />', () => {
  beforeEach(() => {
    initAnalyticsMock.mockReset();
    trackPageViewMock.mockReset();
    usePathnameMock.mockReset();
  });

  it('calls initAnalytics once on mount', () => {
    usePathnameMock.mockReturnValue('/');
    render(<AnalyticsProvider />);
    expect(initAnalyticsMock).toHaveBeenCalledTimes(1);
  });

  it('fires trackPageView for the initial pathname', () => {
    usePathnameMock.mockReturnValue('/plan');
    render(<AnalyticsProvider />);
    expect(trackPageViewMock).toHaveBeenCalledWith('/plan');
  });

  it('fires trackPageView again when the pathname changes', () => {
    usePathnameMock.mockReturnValue('/');
    const { rerender } = render(<AnalyticsProvider />);
    expect(trackPageViewMock).toHaveBeenCalledTimes(1);

    usePathnameMock.mockReturnValue('/plan');
    rerender(<AnalyticsProvider />);
    expect(trackPageViewMock).toHaveBeenCalledTimes(2);
    expect(trackPageViewMock).toHaveBeenLastCalledWith('/plan');
  });

  it('does not fire trackPageView when usePathname returns null', () => {
    usePathnameMock.mockReturnValue(null);
    render(<AnalyticsProvider />);
    expect(trackPageViewMock).not.toHaveBeenCalled();
  });

  it('renders nothing (no DOM output)', () => {
    usePathnameMock.mockReturnValue('/');
    const { container } = render(<AnalyticsProvider />);
    expect(container.firstChild).toBeNull();
  });
});
