// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';
import { LocaleProvider, useLocale } from './locale';
import { LandingWrapper, useLandingLocale } from '@/components/landing/LandingClient';

function PlanLocaleProbe() {
  const { locale, toggleLocale } = useLocale();
  return (
    <>
      <span data-testid="plan-locale">{locale}</span>
      <button onClick={toggleLocale}>toggle-plan</button>
    </>
  );
}

function LandingToggle() {
  const { locale, toggleLocale } = useLandingLocale();
  return (
    <>
      <span data-testid="landing-locale">{locale}</span>
      <button onClick={toggleLocale}>toggle-landing</button>
    </>
  );
}

function clearPersistedLocale() {
  try { localStorage.clear(); } catch { /* jsdom always has it */ }
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

afterEach(() => {
  cleanup();
  clearPersistedLocale();
  document.documentElement.lang = '';
});

describe('LocaleProvider persistence', () => {
  // BUG(p2-planner-ui-state-and-map): LocaleProvider keeps the locale in memory only (useState('vi')), so a reload resets EN to VI. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md
  it('keeps English after the provider remounts (page reload)', async () => {
    const first = render(<LocaleProvider><PlanLocaleProbe /></LocaleProvider>);
    act(() => { first.getByText('toggle-plan').click(); });
    expect(first.getByTestId('plan-locale').textContent).toBe('en');
    first.unmount();

    const second = render(<LocaleProvider><PlanLocaleProbe /></LocaleProvider>);
    await waitFor(() => expect(second.getByTestId('plan-locale').textContent).toBe('en'));
  });

  // BUG(p2-planner-ui-state-and-map): the landing page's locale (LandingWrapper) is a separate in-memory state, so EN chosen on / is lost on /plan. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md
  it('carries English chosen on the landing page into the /plan LocaleProvider', async () => {
    const landing = render(<LandingWrapper><LandingToggle /></LandingWrapper>);
    act(() => { landing.getByText('toggle-landing').click(); });
    expect(landing.getByTestId('landing-locale').textContent).toBe('en');
    landing.unmount();

    // "Start planning" is a plain <a href="/plan">: /plan mounts a fresh LocaleProvider.
    const plan = render(<LocaleProvider><PlanLocaleProbe /></LocaleProvider>);
    await waitFor(() => expect(plan.getByTestId('plan-locale').textContent).toBe('en'));
  });
});
