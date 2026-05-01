'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';

/**
 * Mounts once at the root layout to bootstrap PostHog analytics.
 * Renders nothing — UI-free per DESIGN.md ("less icons, more humanity":
 * no consent banners or analytics affordances added here; PostHog handles
 * its own consent surface if a key is configured).
 *
 * Init is gated inside `initAnalytics`: no-op when the public key is
 * missing or NODE_ENV !== 'production'.
 */
export default function AnalyticsProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
