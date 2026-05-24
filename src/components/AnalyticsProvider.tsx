'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, trackPageView } from '@/lib/analytics';

/**
 * Mounts once at the root layout to bootstrap PostHog analytics.
 * Renders nothing — UI-free per DESIGN.md ("less icons, more humanity":
 * no consent banners or analytics affordances added here; PostHog handles
 * its own consent surface if a key is configured).
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
  }, []);

  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return null;
}
