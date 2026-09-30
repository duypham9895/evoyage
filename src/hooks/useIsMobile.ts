'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 1024; // matches Tailwind lg
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

// SSR has no viewport — render desktop, same default this hook always had.
function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
