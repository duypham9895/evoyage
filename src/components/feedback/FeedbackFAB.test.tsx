// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FeedbackFAB from './FeedbackFAB';

// Mock dependencies
vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) => key === 'feedback_title' ? 'Feedback' : key,
  }),
}));

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false, // desktop by default
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

// Mock next/dynamic to just return the component directly
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    let Component: React.ComponentType<Record<string, unknown>> | null = null;
    loader().then((mod) => { Component = mod.default as React.ComponentType<Record<string, unknown>>; });
    // Return a wrapper that renders the loaded component
    return function DynamicMock(props: Record<string, unknown>) {
      if (!Component) return null;
      return <Component {...props} />;
    };
  },
}));

// Mock FeedbackModal
vi.mock('./FeedbackModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? <div data-testid="feedback-modal"><button onClick={onClose}>Close</button></div> : null
  ),
}));

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

describe('FeedbackFAB', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1440, 900);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T22: Renders with CSS default position (no inline style until drag)
  it('T22: renders at default position on mount', () => {
    render(<FeedbackFAB />);
    const button = screen.getByRole('button', { name: /feedback/i });
    expect(button).toBeDefined();
    // Default: CSS handles positioning, no inline style for position
    expect(button.className).toContain('fixed');
    expect(button.className).toContain('z-[800]');
  });

  // T23: Click opens modal
  it('T23: click (no drag) opens feedback modal', () => {
    render(<FeedbackFAB />);
    const button = screen.getByRole('button', { name: /feedback/i });

    fireEvent.click(button);

    expect(screen.getByTestId('feedback-modal')).toBeDefined();
  });

  // T25: Modal open passes disabled to hook
  it('T25: modal open state is reflected in component', () => {
    render(<FeedbackFAB />);
    const button = screen.getByRole('button', { name: /feedback/i });

    // Open modal
    fireEvent.click(button);
    expect(screen.getByTestId('feedback-modal')).toBeDefined();

    // Close modal
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('feedback-modal')).toBeNull();
  });

  // T26: aria-label is present
  it('T26: aria-label is set to feedback title', () => {
    render(<FeedbackFAB />);
    const button = screen.getByRole('button', { name: /feedback/i });
    expect(button.getAttribute('aria-label')).toBe('Feedback');
  });

  // T27: Pulse animation works
  it('T27: pulse animation shows on first visit', () => {
    render(<FeedbackFAB />);
    const button = screen.getByRole('button', { name: /feedback/i });
    // Pulse should be active since evoyage-feedback-seen is not set
    expect(button.className).toContain('animate-');
  });

  // T28: stationContext prop passes through
  it('T28: stationContext prop is accepted without error', () => {
    const ctx = { stationId: 'station-1', stationName: 'Test Station' };
    expect(() => render(<FeedbackFAB stationContext={ctx} />)).not.toThrow();
  });

  // T24: drag support class present
  it('T24: button has touch-none class for drag support', () => {
    render(<FeedbackFAB />);
    const button = screen.getByRole('button', { name: /feedback/i });
    expect(button.className).toContain('touch-none');
  });
});
