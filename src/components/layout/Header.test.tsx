// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/lib/locale';
import Header from './Header';
import { AA_NORMAL_TEXT, contrastRatio, textColorToken, tokenHex } from '@/lib/__tests__/wcag-contrast';

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

  it('links the Route E wordmark back home with one accessible label', () => {
    render(
      <LocaleProvider>
        <Header />
      </LocaleProvider>,
    );

    const logoLink = screen.getByRole('link', { name: 'eVoyage home' });
    expect(logoLink).toHaveAttribute('href', '/');
    expect(screen.getByText('Voyage')).toBeInTheDocument();
  });

  // BUG(p3-accessibility-wcag): language toggle text uses --color-muted (#6B6B78), 3.30:1 on the header surface. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p3-accessibility-wcag.md
  it.fails('renders the language toggle text with at least 4.5:1 contrast on the header surface (WCAG 1.4.3)', () => {
    render(
      <LocaleProvider>
        <Header />
      </LocaleProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Toggle language' });
    const fg = tokenHex(textColorToken(toggle.className));
    expect(contrastRatio(fg, tokenHex('surface'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
