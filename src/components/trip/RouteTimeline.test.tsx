// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import RouteTimeline from './RouteTimeline';

const BASE_PROPS = {
  startCity: 'TP.HCM',
  startBatteryPercent: 55,
  endCity: 'Đà Lạt',
  arrivalBatteryPercent: 79,
  totalDistanceKm: 292.8,
  swipeHint: '← Swipe',
  ariaStopLabel: (n: number, name: string, arrive: number, depart: number, mins: number) =>
    `Stop ${n}: ${name} arrive ${arrive} depart ${depart} ${mins}min`,
};

describe('RouteTimeline', () => {
  it('renders start and end milestones with city names and battery %', () => {
    render(<RouteTimeline {...BASE_PROPS} stops={[]} />);
    expect(screen.getByText('TP.HCM')).toBeInTheDocument();
    expect(screen.getByText('Đà Lạt')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('79%')).toBeInTheDocument();
  });

  it('renders one column per charging stop with name and battery transition', () => {
    render(
      <RouteTimeline
        {...BASE_PROPS}
        stops={[
          {
            shortName: 'Hồng Nhung',
            distanceFromPrevKm: 106,
            arrivalPercent: 24,
            departurePercent: 80,
            chargeTimeMin: 21,
          },
          {
            shortName: 'Liên Nghĩa',
            distanceFromPrevKm: 176,
            arrivalPercent: 27,
            departurePercent: 80,
            chargeTimeMin: 21,
          },
        ]}
      />,
    );
    expect(screen.getByText('Hồng Nhung')).toBeInTheDocument();
    expect(screen.getByText('Liên Nghĩa')).toBeInTheDocument();
    expect(screen.getByText('24→80%')).toBeInTheDocument();
    expect(screen.getByText('27→80%')).toBeInTheDocument();
  });

  it('shows charge-time labels for stops, not for endpoints', () => {
    render(
      <RouteTimeline
        {...BASE_PROPS}
        stops={[
          {
            shortName: 'Stop A',
            distanceFromPrevKm: 100,
            arrivalPercent: 30,
            departurePercent: 80,
            chargeTimeMin: 25,
          },
        ]}
      />,
    );
    expect(screen.getByText('25m')).toBeInTheDocument();
  });

  it('renders all segments between nodes (distance labels)', () => {
    render(
      <RouteTimeline
        {...BASE_PROPS}
        stops={[
          {
            shortName: 'Stop A',
            distanceFromPrevKm: 106,
            arrivalPercent: 24,
            departurePercent: 80,
            chargeTimeMin: 21,
          },
        ]}
      />,
    );
    // 1 stop → 2 segments: start→stop and stop→end
    // Distance from previous is provided per stop; end-segment is derived from total
    expect(screen.getByText(/106 km/)).toBeInTheDocument();
  });

  it('uses semantic ordered-list markup for accessibility', () => {
    render(<RouteTimeline {...BASE_PROPS} stops={[]} />);
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(list.tagName).toBe('OL');
  });

  it('exposes aria-label on stop milestones via the provided callback', () => {
    render(
      <RouteTimeline
        {...BASE_PROPS}
        stops={[
          {
            shortName: 'Hồng Nhung',
            distanceFromPrevKm: 106,
            arrivalPercent: 24,
            departurePercent: 80,
            chargeTimeMin: 21,
          },
        ]}
      />,
    );
    expect(
      screen.getByLabelText('Stop 1: Hồng Nhung arrive 24 depart 80 21min'),
    ).toBeInTheDocument();
  });

  it('shows swipe hint when 3+ stops (5+ nodes total)', () => {
    const stops = Array.from({ length: 3 }, (_, i) => ({
      shortName: `S${i + 1}`,
      distanceFromPrevKm: 50,
      arrivalPercent: 30,
      departurePercent: 80,
      chargeTimeMin: 20,
    }));
    render(<RouteTimeline {...BASE_PROPS} stops={stops} />);
    expect(screen.getByText('← Swipe')).toBeInTheDocument();
  });

  it('does not show swipe hint when ≤2 stops', () => {
    const stops = [
      {
        shortName: 'S1',
        distanceFromPrevKm: 50,
        arrivalPercent: 30,
        departurePercent: 80,
        chargeTimeMin: 20,
      },
    ];
    render(<RouteTimeline {...BASE_PROPS} stops={stops} />);
    expect(screen.queryByText('← Swipe')).not.toBeInTheDocument();
  });
});
