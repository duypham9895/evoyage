'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, trackColorScheme, trackPageView } from '@/lib/analytics';

/**
 * Mounts once at the root layout to bootstrap PostHog analytics.
 * Renders nothing — UI-free per DESIGN.md ("less icons, more humanity":
 * no consent banners or analytics affordances added here). No banner is
 * added here; see `/privacy` for what the app discloses instead. The browser
 * still sends its IP and user agent to PostHog on every request — that is
 * not something this component (or `initAnalytics`) can prevent (see the
 * header comment in `analytics.ts` for what is and isn't enforced by code).
 *
 * Init is gated inside `initAnalytics`: no-op when the public key is
 * missing or NODE_ENV !== 'production'. Pageview tracking is gated the
 * same way — `trackPageView` is a no-op when analytics never initialized,
 * so dev/test pageviews are never sent.
 *
 * `capture_pageview: false` is set on the PostHog client (see analytics.ts)
 * because the App Router does client-side navigations PostHog's auto-capture
 * would miss. This effect fires on every `usePathname` change so SPA-style
 * navigations are tracked too.
 */
export default function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
    trackColorScheme();
  }, []);

  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return null;
}
