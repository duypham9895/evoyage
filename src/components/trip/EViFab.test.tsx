// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import EViFab from './EViFab';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) => (key === 'evi_fab_label' ? 'Mở trợ lý eVi' : key),
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

describe('EViFab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a circular button with "eVi" text and aria-label', () => {
    render(<EViFab onOpen={vi.fn()} isOpen={false} />);
    const button = screen.getByRole('button', { name: 'Mở trợ lý eVi' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('eVi');
    expect(button.className).toMatch(/rounded-full/);
  });

  it('is hidden on desktop via lg:hidden class', () => {
    render(<EViFab onOpen={vi.fn()} isOpen={false} />);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/lg:hidden/);
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<EViFab onOpen={onOpen} isOpen={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is hidden when isOpen is true', () => {
    render(<EViFab onOpen={vi.fn()} isOpen={true} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
