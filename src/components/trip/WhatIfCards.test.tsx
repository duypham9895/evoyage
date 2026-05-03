// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import WhatIfCards, { type WhatIfOption } from './WhatIfCards';

const baseOption: WhatIfOption = {
  key: 'now',
  label: 'Đi ngay',
  departAt: null,
  totalDurationMin: 254,
  arrivalEtaIso: new Date(Date.now() + 254 * 60_000).toISOString(),
  peakWindowReason: null,
};

describe('WhatIfCards', () => {
  it('renders one card per option', () => {
    render(
      <WhatIfCards
        options={[
          baseOption,
          { ...baseOption, key: 'plus2h', label: 'Chờ 2 giờ', totalDurationMin: 230 },
          { ...baseOption, key: 'tomorrow', label: 'Sáng mai', totalDurationMin: 215 },
        ]}
        currentKey="now"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Đi ngay')).toBeInTheDocument();
    expect(screen.getByText('Chờ 2 giờ')).toBeInTheDocument();
    expect(screen.getByText('Sáng mai')).toBeInTheDocument();
  });

  it('shows total duration in human-readable hh/m format', () => {
    render(
      <WhatIfCards
        options={[{ ...baseOption, totalDurationMin: 254 }]}
        currentKey="now"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/4h14m/)).toBeInTheDocument();
  });

  it('marks the currently-selected card with aria-current', () => {
    render(
      <WhatIfCards
        options={[
          baseOption,
          { ...baseOption, key: 'plus2h', label: 'Chờ 2 giờ' },
        ]}
        currentKey="plus2h"
        onSelect={() => {}}
      />,
    );
    const cards = screen.getAllByRole('button');
    const selected = cards.find((c) => c.getAttribute('aria-current') === 'true');
    expect(selected).toBeDefined();
    expect(selected!).toHaveTextContent('Chờ 2 giờ');
  });

  it('invokes onSelect with the picked option when a non-current card is tapped', () => {
    const onSelect = vi.fn();
    render(
      <WhatIfCards
        options={[
          baseOption,
          { ...baseOption, key: 'plus2h', label: 'Chờ 2 giờ' },
        ]}
        currentKey="now"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('Chờ 2 giờ'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'plus2h' }),
    );
  });

  it('does NOT invoke onSelect when the current card is tapped (no-op)', () => {
    const onSelect = vi.fn();
    render(
      <WhatIfCards options={[baseOption]} currentKey="now" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('Đi ngay'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a peak-window badge when an option carries one', () => {
    render(
      <WhatIfCards
        options={[
          { ...baseOption, peakWindowReason: 'Giờ cao điểm chiều thứ 6' },
        ]}
        currentKey="now"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Giờ cao điểm chiều thứ 6')).toBeInTheDocument();
  });

  it('renders a loading skeleton placeholder when totalDurationMin is null', () => {
    render(
      <WhatIfCards
        options={[
          { ...baseOption, totalDurationMin: null, arrivalEtaIso: null },
        ]}
        currentKey="now"
        onSelect={() => {}}
      />,
    );
    // Skeleton uses --h--m and --:-- placeholder text for duration and eta
    expect(screen.getByText('--h--m')).toBeInTheDocument();
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });

  it('renders nothing when options list is empty', () => {
    const { container } = render(
      <WhatIfCards options={[]} currentKey="now" onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
