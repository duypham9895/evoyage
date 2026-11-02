/**
 * A real Mapbox public token always starts with `pk.`. A redaction
 * placeholder (or any other non-token string) accidentally pasted into
 * NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN / MAPBOX_ACCESS_TOKEN is non-empty, so a
 * plain `Boolean(token)` check treats it as configured — issue #100.
 */
export function isUsableMapboxToken(token: string | undefined): boolean {
  return typeof token === 'string' && /^pk\./.test(token.trim());
}
