// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SampleTripChips from '@/components/trip/SampleTripChips';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

// Mock locale module — `t()` resolves from the actual locale JSON so
// component-level localization is exercised end-to-end without a provider.
const mockLocaleState = { current: 'vi' as 'vi' | 'en' };
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocaleState.current,
    toggleLocale: () => {},
    t: (key: string) =>
      (dicts[mockLocaleState.current] as Record<string, string>)[key] ?? key,
    tBi: (obj: { messageVi: string; messageEn: string }) =>
      mockLocaleState.current === 'vi' ? obj.messageVi : obj.messageEn,
  }),
}));

describe('SampleTripChips', () => {
  beforeEach(() => {
    mockLocaleState.current = 'vi';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders 4 chip buttons when both inputs are empty', () => {
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  it('does not render when start has a non-empty value', () => {
    const onPick = vi.fn();
    const { container } = render(
      <SampleTripChips start="Quận 1" end="" onPick={onPick} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('does not render when end has a non-empty value', () => {
    const onPick = vi.fn();
    const { container } = render(
      <SampleTripChips start="" end="Đà Lạt" onPick={onPick} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('does not render when both inputs have whitespace-only content', () => {
    const onPick = vi.fn();
    // Whitespace-only is treated as empty (trimmed) → still shows chips,
    // because user has not typed meaningful content yet.
    render(<SampleTripChips start="   " end="   " onPick={onPick} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('does not render when start has whitespace + characters', () => {
    const onPick = vi.fn();
    const { container } = render(
      <SampleTripChips start="  HCM  " end="" onPick={onPick} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onPick with start and end when a chip is tapped', () => {
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} />);

    const firstChip = screen.getAllByRole('button')[0];
    fireEvent.click(firstChip);

    expect(onPick).toHaveBeenCalledTimes(1);
    const arg = onPick.mock.calls[0][0];
    expect(arg).toHaveProperty('start');
    expect(arg).toHaveProperty('end');
    expect(typeof arg.start).toBe('string');
    expect(typeof arg.end).toBe('string');
    expect(arg.start.length).toBeGreaterThan(0);
    expect(arg.end.length).toBeGreaterThan(0);
  });

  it('renders Vietnamese labels when locale is vi', () => {
    mockLocaleState.current = 'vi';
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} />);

    // VN label uses "Quận 1, TP.HCM" — appears twice (Đà Lạt + Vũng Tàu chips)
    expect(screen.getAllByText(/Quận 1, TP\.HCM/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Đà Lạt/)).toBeInTheDocument();
    expect(screen.getByText(/Vũng Tàu/)).toBeInTheDocument();
    expect(screen.getByText(/Hà Nội/)).toBeInTheDocument();
    expect(screen.getByText(/Hạ Long/)).toBeInTheDocument();
    expect(screen.getByText(/Đà Nẵng/)).toBeInTheDocument();
    expect(screen.getByText(/Huế/)).toBeInTheDocument();
    // Section heading
    expect(screen.getByText('Gợi ý cho bạn')).toBeInTheDocument();
  });

  it('renders English labels when locale is en', () => {
    mockLocaleState.current = 'en';
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} />);

    expect(screen.getAllByText(/District 1, HCMC/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Da Lat/)).toBeInTheDocument();
    expect(screen.getByText(/Vung Tau/)).toBeInTheDocument();
    expect(screen.getByText(/Hanoi/)).toBeInTheDocument();
    expect(screen.getByText(/Ha Long/)).toBeInTheDocument();
    expect(screen.getByText(/Da Nang/)).toBeInTheDocument();
    expect(screen.getByText(/Hue/)).toBeInTheDocument();
    expect(screen.getByText('Try a sample trip')).toBeInTheDocument();
  });

  it('passes the matching start/end pair when a specific chip is tapped (vi)', () => {
    mockLocaleState.current = 'vi';
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} />);

    // Find the "Hà Nội → Hạ Long" chip by its text content
    const haLongChip = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.includes('Hạ Long'));
    expect(haLongChip).toBeTruthy();
    fireEvent.click(haLongChip!);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({
      start: 'Hà Nội',
      end: 'Hạ Long',
    });
  });

  // Trip-calc input lock (spec: 2026-05-03-trip-calc-input-lock-design.md §3.1)
  // While a trip calc is in flight, sample chips must not trigger another
  // sample-trip swap that would create a race condition with the live calc.
  it('renders all chips as disabled when disabled=true', () => {
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} disabled />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('does not call onPick when a disabled chip is clicked', () => {
    const onPick = vi.fn();
    render(<SampleTripChips start="" end="" onPick={onPick} disabled />);
    const firstChip = screen.getAllByRole('button')[0];
    fireEvent.click(firstChip);
    expect(onPick).not.toHaveBeenCalled();
  });
});
