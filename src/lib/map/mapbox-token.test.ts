import { describe, it, expect } from 'vitest';
import { isUsableMapboxToken } from './mapbox-token';

/**
 * Regression net for issue #100 — production inlined a redaction placeholder
 * (`[SENSITIVE]`, 11 chars, letters + brackets) as
 * NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN. It is non-empty, so the old
 * `Boolean(token)` check treated it as configured and never fell back to
 * OSM/Leaflet. A real Mapbox public token always starts with `pk.`.
 */
describe('isUsableMapboxToken', () => {
  it('rejects undefined', () => {
    expect(isUsableMapboxToken(undefined)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isUsableMapboxToken('')).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    expect(isUsableMapboxToken('   ')).toBe(false);
  });

  it('rejects the redaction placeholder from issue #100', () => {
    expect(isUsableMapboxToken('[SENSITIVE]')).toBe(false);
  });

  it('rejects a non-pk token that does not match the Mapbox public token prefix', () => {
    expect(isUsableMapboxToken('sk.secret-token')).toBe(false);
  });

  it('accepts a well-formed pk. token', () => {
    expect(isUsableMapboxToken('pk.abc')).toBe(true);
  });

  it('accepts a pk. token with surrounding whitespace', () => {
    expect(isUsableMapboxToken(' pk.x ')).toBe(true);
  });
});
