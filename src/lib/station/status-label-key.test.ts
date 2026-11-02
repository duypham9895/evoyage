import { describe, it, expect } from 'vitest';
import { getStationStatusKey } from './status-label-key';

describe('getStationStatusKey', () => {
  it('maps working and busy enums to their own keys', () => {
    expect(getStationStatusKey('ACTIVE')).toBe('nearby_active');
    expect(getStationStatusKey('BUSY')).toBe('nearby_busy');
  });

  it('maps every not-working enum to inactive, never active', () => {
    expect(getStationStatusKey('INACTIVE')).toBe('nearby_inactive');
    expect(getStationStatusKey('UNAVAILABLE')).toBe('nearby_inactive');
    expect(getStationStatusKey('OUTOFSERVICE')).toBe('nearby_inactive');
  });

  it('accepts lowercase enums', () => {
    expect(getStationStatusKey('inactive')).toBe('nearby_inactive');
    expect(getStationStatusKey('active')).toBe('nearby_active');
  });

  it('returns the neutral unknown key for null, empty or unrecognised status', () => {
    expect(getStationStatusKey(null)).toBe('map_status_unknown');
    expect(getStationStatusKey(undefined)).toBe('map_status_unknown');
    expect(getStationStatusKey('')).toBe('map_status_unknown');
    expect(getStationStatusKey('SOMETHING_NEW')).toBe('map_status_unknown');
  });
});
