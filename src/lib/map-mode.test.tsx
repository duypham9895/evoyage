// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MapModeProvider, useMapMode } from './map-mode';

function MapModeProbe() {
  const { mode } = useMapMode();
  return <output aria-label="map mode">{mode}</output>;
}

describe('MapModeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses Mapbox as the single product map mode', () => {
    render(
      <MapModeProvider>
        <MapModeProbe />
      </MapModeProvider>,
    );

    expect(screen.getByLabelText('map mode')).toHaveTextContent('mapbox');
  });

  it('migrates legacy saved map choices to Mapbox', async () => {
    localStorage.setItem('evoyage-map-mode', 'osm');

    render(
      <MapModeProvider>
        <MapModeProbe />
      </MapModeProvider>,
    );

    await waitFor(() => {
      expect(localStorage.getItem('evoyage-map-mode')).toBe('mapbox');
    });
  });
});
