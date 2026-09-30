// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import ElevationChart from './ElevationChart';
import type { ElevationProfile } from '@/lib/geo/elevation';

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const profile: ElevationProfile = {
  points: [
    { distanceKm: 0, elevationM: 10, lngLat: [106.7, 10.77], gradient: 0 },
    { distanceKm: 50, elevationM: 400, lngLat: [107.2, 11.2], gradient: 4 },
    { distanceKm: 100, elevationM: 1500, lngLat: [108.4, 11.94], gradient: 6 },
  ],
  totalAscentM: 1490,
  totalDescentM: 0,
  maxGradientPercent: 6,
  maxElevationM: 1500,
  minElevationM: 10,
  shouldDisplay: true,
  steepSections: [],
};

describe('ElevationChart charging stop markers', () => {
  it('marks each charging stop without using an emoji glyph', () => {
    const { container } = render(
      <ElevationChart profile={profile} chargingStopDistances={[25, 75]} />,
    );

    expect(container.textContent).not.toContain('⚡');
    expect(container.querySelectorAll('[data-testid="elevation-charging-stop"]')).toHaveLength(2);
  });
});
