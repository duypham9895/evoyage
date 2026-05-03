// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import ErrorBanner from './ErrorBanner';
import { LocaleProvider } from '@/lib/locale';

function renderWithLocale(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe('ErrorBanner', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/plan');
  });

  it('renders nothing when no error param is present', () => {
    const { container } = renderWithLocale(<ErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the alert when ?error=link-not-found is present', () => {
    window.history.replaceState(null, '', '/plan?error=link-not-found');
    renderWithLocale(<ErrorBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the alert for any error code (generic fallback)', () => {
    window.history.replaceState(null, '', '/plan?error=anything-else');
    renderWithLocale(<ErrorBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('hides the banner when dismiss button is clicked', () => {
    window.history.replaceState(null, '', '/plan?error=link-not-found');
    renderWithLocale(<ErrorBanner />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removes the error param from URL on dismiss while preserving other params', () => {
    window.history.replaceState(null, '', '/plan?error=link-not-found&start=Hanoi');
    renderWithLocale(<ErrorBanner />);
    fireEvent.click(screen.getByRole('button'));
    expect(window.location.search).not.toContain('error=');
    expect(window.location.search).toContain('start=Hanoi');
  });
});
