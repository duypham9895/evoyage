/**
 * Trigger haptic feedback if supported.
 * Falls back silently when Vibration API is unavailable.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Light tap — for tab switches, selections */
export function hapticLight(): void {
  if (prefersReducedMotion()) return;
  navigator?.vibrate?.(10);
}

/** Medium tap — for confirmations, plan calculated */
export function hapticMedium(): void {
  if (prefersReducedMotion()) return;
  navigator?.vibrate?.(25);
}

/** Selection tick — for slider snap to preset */
export function hapticTick(): void {
  if (prefersReducedMotion()) return;
  navigator?.vibrate?.(5);
}
