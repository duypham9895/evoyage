/**
 * Heuristic peak-hour traffic model for Vietnam.
 *
 * Drives Phase 2's $0 fallback path when the Mapbox driving-traffic profile
 * is unavailable, and supplies the "expected congestion" callout shown in
 * the trip overview headline. See spec §3c.
 *
 * Calibration sources (informal):
 * - HCM/Hà Nội traffic peaks well-documented in local press: 06:30-09:00
 *   morning, 16:30-19:30 evening (worse on Friday)
 * - Sunday "return-to-city" surge on QL51, QL1A, QL5 is observable in any
 *   return-from-weekend-trip dashcam / pendulum analysis
 * - Holiday boosters layer on top of base multipliers: 30/4, 2/9, Tết all
 *   trigger nationwide travel surges
 *
 * Pure function, no I/O. Inputs: a Date (UTC instant) + the polyline of the
 * planned route. Output: a single PeakWindow describing the predicted
 * congestion factor at that instant, or null if no peak applies.
 */
import { decodePolyline } from '@/lib/geo/polyline';
import { isHoliday, isHolidayWindow } from './vietnam-holidays';

export interface PeakWindow {
  readonly multiplier: number; // 1.0 = no change, 1.5 = +50% travel time
  readonly reasonVi: string;
  readonly reasonEn: string;
}

/** [latMin, latMax, lngMin, lngMax] — tight enough to mean "route through city center" */
const HCM_BBOX = [10.65, 10.9, 106.55, 106.85] as const;
const HN_BBOX = [20.95, 21.1, 105.75, 105.95] as const;

const MAX_MULTIPLIER = 2.0;

function intersects(polyline: string, bbox: readonly [number, number, number, number]): boolean {
  let points;
  try {
    points = decodePolyline(polyline);
  } catch {
    return false;
  }
  if (points.length === 0) return false;
  const [latMin, latMax, lngMin, lngMax] = bbox;
  return points.some(
    (p) => p.lat >= latMin && p.lat <= latMax && p.lng >= lngMin && p.lng <= lngMax,
  );
}

/** Extract the hour-of-day in Asia/Ho_Chi_Minh as a fractional number (e.g. 7.5 for 07:30). */
function vnHour(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hh, mm] = fmt.format(date).split(':').map(Number);
  return hh! + mm! / 60;
}

/** 0 = Sunday, 1 = Monday, ..., 6 = Saturday — in Asia/Ho_Chi_Minh */
function vnDayOfWeek(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
  });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt.format(date)] ?? 0;
}

export function evaluatePeakHour(departAt: Date, polyline: string): PeakWindow | null {
  if (!polyline) return null;

  const hitsCity = intersects(polyline, HCM_BBOX) || intersects(polyline, HN_BBOX);
  if (!hitsCity) return null;

  const hour = vnHour(departAt);
  const dow = vnDayOfWeek(departAt);
  const isWeekday = dow >= 1 && dow <= 5;
  const isFriday = dow === 5;
  const isSunday = dow === 0;

  let baseMultiplier: number | null = null;
  let reasonVi: string | null = null;
  let reasonEn: string | null = null;

  // Morning peak: 06:30 – 09:00 weekdays
  if (isWeekday && hour >= 6.5 && hour <= 9) {
    baseMultiplier = 1.3;
    reasonVi = 'Giờ cao điểm sáng (06:30–09:00)';
    reasonEn = 'Morning peak hour (06:30–09:00)';
  }
  // Evening peak: 16:30 – 19:30 weekdays, +20% on Fridays
  else if (isWeekday && hour >= 16.5 && hour <= 19.5) {
    baseMultiplier = isFriday ? 1.5 : 1.3;
    reasonVi = isFriday
      ? 'Giờ cao điểm chiều thứ 6 (16:30–19:30)'
      : 'Giờ cao điểm chiều (16:30–19:30)';
    reasonEn = isFriday
      ? 'Friday evening peak (16:30–19:30)'
      : 'Evening peak hour (16:30–19:30)';
  }
  // Sunday return-to-city wave: 16:00 – 20:00
  else if (isSunday && hour >= 16 && hour <= 20) {
    baseMultiplier = 1.4;
    reasonVi = 'Sóng về thành phố chiều chủ nhật';
    reasonEn = 'Sunday return-to-city wave';
  }

  // Holiday-window boost — only stacks onto an existing peak window
  // (so a holiday at 03:00 AM doesn't generate a fake "peak" callout)
  let multiplier = baseMultiplier;
  if (multiplier !== null) {
    const onHoliday = isHoliday(departAt);
    if (onHoliday && onHoliday.kind === 'travel-heavy') {
      multiplier = Math.min(MAX_MULTIPLIER, multiplier + 0.3);
      reasonVi = `${reasonVi} · ngày lễ ${onHoliday.nameVi}`;
      reasonEn = `${reasonEn} · holiday ${onHoliday.nameEn}`;
    } else if (isHolidayWindow(departAt, 1)) {
      multiplier = Math.min(MAX_MULTIPLIER, multiplier + 0.15);
      reasonVi = `${reasonVi} · gần ngày lễ`;
      reasonEn = `${reasonEn} · near a holiday`;
    }
  }

  if (multiplier === null) return null;

  return {
    multiplier: Math.round(multiplier * 100) / 100,
    reasonVi: reasonVi!,
    reasonEn: reasonEn!,
  };
}
