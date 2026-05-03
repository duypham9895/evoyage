import { describe, it, expect } from 'vitest';
import { evaluatePeakHour } from './peak-hour-model';
import { encodePolyline } from '@/lib/geo/polyline';

// Helper: build a Date in Vietnam local time
function vn(yyyyMmDd: string, hhmm: string): Date {
  return new Date(`${yyyyMmDd}T${hhmm}:00+07:00`);
}

const HCM_INSIDE = { lat: 10.78, lng: 106.7 }; // Quận 1, TP.HCM
const HN_INSIDE = { lat: 21.02, lng: 105.85 }; // Hà Nội center
const RURAL_DELTA = { lat: 10.05, lng: 105.78 }; // Cần Thơ — outside both bboxes

const polylineHcm = encodePolyline([
  HCM_INSIDE,
  { lat: 10.5, lng: 106.7 },
  { lat: 10.35, lng: 107.08 },
]);
const polylineHn = encodePolyline([
  HN_INSIDE,
  { lat: 20.5, lng: 105.95 },
]);
const polylineMekong = encodePolyline([
  RURAL_DELTA,
  { lat: 10.0, lng: 105.7 },
]);

describe('evaluatePeakHour', () => {
  it('returns null outside any peak window', () => {
    // Tuesday 14:00 — not morning peak, not evening peak, weekday but mid-afternoon
    const result = evaluatePeakHour(vn('2026-05-05', '14:00'), polylineHcm);
    expect(result).toBeNull();
  });

  it('detects weekday morning peak when polyline crosses HCM bbox', () => {
    // Tuesday 07:30 — within 06:30-09:00 morning window
    const result = evaluatePeakHour(vn('2026-05-05', '07:30'), polylineHcm);
    expect(result).not.toBeNull();
    expect(result!.multiplier).toBeGreaterThan(1.0);
    expect(result!.multiplier).toBeLessThanOrEqual(1.4);
    expect(result!.reasonVi).toMatch(/giờ cao điểm|sáng/i);
  });

  it('detects weekday evening peak with elevated multiplier on Friday', () => {
    // Friday 17:30 HCM
    const friday = evaluatePeakHour(vn('2026-05-08', '17:30'), polylineHcm);
    // Tuesday 17:30 HCM
    const tuesday = evaluatePeakHour(vn('2026-05-05', '17:30'), polylineHcm);
    expect(friday!.multiplier).toBeGreaterThan(tuesday!.multiplier);
  });

  it('returns null when polyline is far from any city bbox', () => {
    // Even at peak hour, a Mekong delta route doesn't trigger city peaks
    const result = evaluatePeakHour(vn('2026-05-05', '07:30'), polylineMekong);
    expect(result).toBeNull();
  });

  it('detects Sunday return-to-city peak on routes touching HCM', () => {
    // Sunday 18:00 — typical Vũng Tàu / Long Hải return wave
    const result = evaluatePeakHour(vn('2026-05-10', '18:00'), polylineHcm);
    expect(result).not.toBeNull();
    expect(result!.reasonVi).toMatch(/về|chiều chủ nhật|cuối tuần/i);
  });

  it('boosts multiplier during travel-heavy holiday windows', () => {
    // 30/4 evening — Reunification Day, travel-heavy
    const onReunification = evaluatePeakHour(vn('2026-04-30', '17:30'), polylineHcm);
    const normalFriday = evaluatePeakHour(vn('2026-05-08', '17:30'), polylineHcm);
    expect(onReunification!.multiplier).toBeGreaterThan(normalFriday!.multiplier);
    expect(onReunification!.reasonVi).toMatch(/lễ|ngày lễ/i);
  });

  it('handles Hà Nội bbox routes the same way as HCM', () => {
    const result = evaluatePeakHour(vn('2026-05-05', '07:30'), polylineHn);
    expect(result).not.toBeNull();
    expect(result!.multiplier).toBeGreaterThan(1.0);
  });

  it('returns null for empty or malformed polyline', () => {
    expect(evaluatePeakHour(vn('2026-05-05', '07:30'), '')).toBeNull();
  });

  it('weekday early-morning before peak (e.g. 05:00) returns null', () => {
    const result = evaluatePeakHour(vn('2026-05-05', '05:00'), polylineHcm);
    expect(result).toBeNull();
  });

  it('caps multiplier at a reasonable ceiling even when stacked with holiday', () => {
    // Friday 17:30 + holiday + city → should not exceed ~2.0
    const result = evaluatePeakHour(vn('2026-04-30', '17:30'), polylineHcm);
    expect(result!.multiplier).toBeLessThanOrEqual(2.0);
  });
});
