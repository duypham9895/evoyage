import { describe, it, expect } from 'vitest';
import { detectPasses } from './detect-passes';
import { encodePolyline } from '@/lib/geo/polyline';
import type { LatLng } from '@/types';

function encode(points: readonly LatLng[]): string {
  return encodePolyline(points);
}

describe('detectPasses', () => {
  it('returns empty array for empty polyline', () => {
    expect(detectPasses('')).toEqual([]);
  });

  it('returns empty array for malformed polyline', () => {
    expect(detectPasses('not-a-real-polyline-encoding!@#$')).toEqual([]);
  });

  it('detects Đèo Bảo Lộc when polyline traverses the bbox', () => {
    // HCM (10.78, 106.70) → Đà Lạt (11.94, 108.45) passes through (11.47, 107.80)
    const polyline = encode([
      { lat: 10.78, lng: 106.7 },
      { lat: 11.47, lng: 107.8 }, // inside bao-loc bbox
      { lat: 11.94, lng: 108.45 },
    ]);
    const result = detectPasses(polyline);
    expect(result.map((p) => p.id)).toContain('bao-loc');
  });

  it('returns empty for HCM → Vũng Tàu (no passes on that route)', () => {
    const polyline = encode([
      { lat: 10.78, lng: 106.7 },
      { lat: 10.5, lng: 107.0 },
      { lat: 10.35, lng: 107.08 }, // Vũng Tàu — no major passes
    ]);
    expect(detectPasses(polyline)).toEqual([]);
  });

  it('detects multiple passes when polyline crosses several', () => {
    // Synthetic route hitting both Bảo Lộc AND Khánh Lê bboxes
    const polyline = encode([
      { lat: 11.45, lng: 107.8 }, // bao-loc
      { lat: 12.0, lng: 108.5 },
      { lat: 12.27, lng: 108.75 }, // khanh-le
    ]);
    const result = detectPasses(polyline);
    const ids = result.map((p) => p.id).sort();
    expect(ids).toEqual(['bao-loc', 'khanh-le']);
  });

  it('caps result at 3 passes even if polyline somehow hits more', () => {
    // Synthetic polyline crossing all 5 known pass bboxes
    const polyline = encode([
      { lat: 11.47, lng: 107.8 }, // bao-loc
      { lat: 12.27, lng: 108.75 }, // khanh-le
      { lat: 16.21, lng: 108.15 }, // hai-van
      { lat: 13.81, lng: 109.15 }, // cu-mong
      { lat: 21.6, lng: 103.37 }, // pha-din
    ]);
    expect(detectPasses(polyline)).toHaveLength(3);
  });

  it('does not false-positive when polyline is far from all passes', () => {
    // Long route through Mekong delta — no mountain passes
    const polyline = encode([
      { lat: 10.05, lng: 105.78 }, // Cần Thơ
      { lat: 10.3, lng: 105.65 },
      { lat: 9.78, lng: 105.4 }, // Cà Mau direction
    ]);
    expect(detectPasses(polyline)).toEqual([]);
  });
});
