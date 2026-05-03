// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import EViMobileSheet from './EViMobileSheet';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) =>
      key === 'evi_sheet_close' ? 'Đóng' :
      key === 'evi_sheet_title' ? 'eVi' :
      key,
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

vi.mock('@/components/EVi', () => ({
  default: () => <div data-testid="evi-stub">eVi content</div>,
}));

describe('EViMobileSheet', () => {
  beforeEach(() => vi.clearAllMocks());

  const props = {
    onClose: vi.fn(),
    onTripParsed: vi.fn(),
    onPlanTrip: vi.fn(),
    onFindNearbyStations: vi.fn(),
    isPlanning: false,
  };

  it('renders the EVi child component when open', () => {
    render(<EViMobileSheet isOpen={true} {...props} />);
    expect(screen.getByTestId('evi-stub')).toBeInTheDocument();
  });

  it('hides the sheet via class (does not unmount child) when closed', () => {
    render(<EViMobileSheet isOpen={false} {...props} />);
    expect(screen.getByTestId('evi-stub')).toBeInTheDocument();
    const container = screen.getByTestId('evi-stub').closest('[role="dialog"]');
    expect(container?.className).toMatch(/hidden/);
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<EViMobileSheet {...props} isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape keypress when open', () => {
    const onClose = vi.fn();
    render(<EViMobileSheet {...props} isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on Escape when closed', () => {
    const onClose = vi.fn();
    render(<EViMobileSheet {...props} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
