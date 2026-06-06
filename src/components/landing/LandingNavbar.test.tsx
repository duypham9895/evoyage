// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LandingNavbar } from './LandingClient';

describe('LandingNavbar', () => {
  it('uses the Route E wordmark as a home link', () => {
    render(
      <LandingNavbar
        locale="vi"
        onLocaleChangeAction={() => {}}
        translations={{ navCta: 'Bắt đầu' }}
      />,
    );

    const logoLink = screen.getByRole('link', { name: 'eVoyage home' });
    expect(logoLink).toHaveAttribute('href', '/');
    expect(screen.getByText('Voyage')).toBeInTheDocument();
  });
});
