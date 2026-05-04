import { describe, it, expect } from 'vitest';
import { buildVinfastReservationUrl } from './vinfast-reservation-url';

describe('buildVinfastReservationUrl', () => {
  it('returns a deep-link URL when storeId is present', () => {
    const url = buildVinfastReservationUrl({ storeId: 'C.HCM0001', stationCode: 'vfc_HCM0001' });
    expect(url).toContain('C.HCM0001');
    expect(url).toMatch(/^https:\/\//);
  });

  it('returns null when storeId is missing', () => {
    expect(buildVinfastReservationUrl({ storeId: null, stationCode: 'vfc_HCM0001' })).toBeNull();
  });

  it('returns null when storeId is empty string', () => {
    expect(buildVinfastReservationUrl({ storeId: '', stationCode: 'vfc_HCM0001' })).toBeNull();
  });

  it('URL-encodes the storeId so special characters are safe', () => {
    const url = buildVinfastReservationUrl({ storeId: 'C HCM 0001', stationCode: '' });
    // Encoded space (%20 or +) — either is acceptable
    expect(url).toMatch(/C(%20|\+){1}HCM(%20|\+){1}0001/);
  });

  it('omits stationCode when not provided', () => {
    const url = buildVinfastReservationUrl({ storeId: 'C.HCM0001', stationCode: null });
    expect(url).toContain('C.HCM0001');
  });
});
