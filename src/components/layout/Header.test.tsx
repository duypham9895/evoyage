// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/lib/locale';
import Header from './Header';

describe('Header', () => {
  it('keeps map provider choice hidden from users', () => {
    render(
      <LocaleProvider>
        <Header />
      </LocaleProvider>,
    );

    expect(screen.getByRole('button', { name: 'Toggle language' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use OSM map/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use Mapbox map/i })).not.toBeInTheDocument();
    expect(screen.queryByText('OSM')).not.toBeInTheDocument();
    expect(screen.queryByText('Mapbox')).not.toBeInTheDocument();
  });
});
