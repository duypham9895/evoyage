// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import EVi from './EVi';

// This test exercises EVi's greeting through a real SSR → hydrate cycle to
// prove the react-hooks-compiler refactor (useSyncExternalStore "isClient"
// flag + render-time state adjustment, replacing the old
// `useEffect(() => setGreetingKey(...), [isFirstVisit])`) preserves the
// original hydration-safety contract: server and first client render must
// match, and the real time-of-day greeting must settle right after.

const GREETINGS: Record<string, string> = {
  evi_greeting_first: 'Hi! Tell me where you want to go!',
  evi_greeting_morning: 'Good morning!',
  evi_greeting_evening: 'Good evening!',
  evi_greeting_return: 'Welcome back!',
  evi_placeholder: 'placeholder',
  evi_find_stations: 'Find stations nearby',
};

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'vi',
    t: (key: string) => GREETINGS[key] ?? key,
  }),
}));

vi.mock('@/lib/haptics', () => ({ hapticLight: vi.fn() }));

vi.mock('@/hooks/useSpeechInput', () => ({
  useSpeechInput: () => ({
    isSupported: false,
    isListening: false,
    isProcessing: false,
    transcript: '',
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

const mockUseEViReturn = {
  state: 'idle' as const,
  messages: [] as { role: 'user' | 'assistant'; content: string }[],
  lastResponse: null,
  userLocation: null,
  isFirstVisit: false,
  recentTrips: [] as { start: string; end: string; vehicleName?: string | null }[],
  followUpSuggestions: [] as string[],
  isSuggestionsLoading: false,
  sendMessage: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@/hooks/useEVi', () => ({
  useEVi: () => mockUseEViReturn,
}));

describe('EVi greeting — hydration safety (react-hooks compiler refactor)', () => {
  let container: HTMLDivElement;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    // 10:00 local time → "morning" branch of getGreetingKey, distinct from
    // the always-shown SSR greeting (evi_greeting_first).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00'));
    container = document.createElement('div');
    document.body.appendChild(container);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('server HTML always shows the first-visit greeting, hydration logs no mismatch, and the time-based greeting settles after mount', () => {
    const html = renderToString(<EVi onTripParsed={vi.fn()} />);
    // isFirstVisit is false in the mock, yet SSR must still render the
    // fixed first-visit greeting — it never branches on time or locale.
    expect(html).toContain(GREETINGS.evi_greeting_first);
    container.innerHTML = html;

    act(() => {
      hydrateRoot(container, <EVi onTripParsed={vi.fn()} />);
    });

    const hydrationMismatchLogged = errorSpy.mock.calls.some((call: unknown[]) =>
      call.some(
        (arg: unknown) => typeof arg === 'string' && /hydrat|did not match|text content/i.test(arg),
      ),
    );
    expect(hydrationMismatchLogged).toBe(false);

    // Post-hydration render settles on the real time-based greeting and
    // drops the placeholder first-visit text.
    expect(container.textContent).toContain(GREETINGS.evi_greeting_morning);
    expect(container.textContent).not.toContain(GREETINGS.evi_greeting_first);
  });
});
