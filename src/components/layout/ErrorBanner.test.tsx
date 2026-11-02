// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import ErrorBanner from './ErrorBanner';
import { LocaleProvider } from '@/lib/locale';
import vi from '@/locales/vi.json';

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

  it('says the link was not found (not expired) for ?error=link-not-found', () => {
    window.history.replaceState(null, '', '/plan?error=link-not-found');
    renderWithLocale(<ErrorBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(vi.share_link_not_found);
  });

  it('says the link expired for ?error=link-expired', () => {
    window.history.replaceState(null, '', '/plan?error=link-expired');
    renderWithLocale(<ErrorBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(vi.share_expired);
  });

  it('says the link could not be opened right now for ?error=link-unavailable', () => {
    window.history.replaceState(null, '', '/plan?error=link-unavailable');
    renderWithLocale(<ErrorBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(vi.share_link_unavailable);
  });

  it.each(['anything-else', 'constructor'])('falls back to the not-found copy for an unknown error code (%s)', (code) => {
    window.history.replaceState(null, '', `/plan?error=${code}`);
    renderWithLocale(<ErrorBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(vi.share_link_not_found);
  });

  it('keeps showing the banner after the plan page URL sync strips ?error and the banner re-renders', () => {
    window.history.replaceState(null, '', '/plan?error=link-expired');
    const { rerender } = renderWithLocale(<ErrorBanner />);
    // plan/page.tsx syncToUrl rewrites the URL from trip state ~300 ms after mount, dropping `error`.
    window.history.replaceState(null, '', '/plan');
    rerender(<LocaleProvider><ErrorBanner /></LocaleProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent(vi.share_expired);
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
