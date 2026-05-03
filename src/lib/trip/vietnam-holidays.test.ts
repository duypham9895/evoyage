import { describe, it, expect } from 'vitest';
import {
  isHoliday,
  isHolidayWindow,
  nextHoliday,
  VIETNAM_HOLIDAYS,
} from './vietnam-holidays';

// Helper: build a Date for a specific YYYY-MM-DD HH:mm in Vietnam local time.
// VN is UTC+7 with no DST, so subtract 7 hours to get the equivalent UTC instant.
function vnDate(yyyyMmDd: string, hhmm: string = '12:00'): Date {
  return new Date(`${yyyyMmDd}T${hhmm}:00+07:00`);
}

describe('VIETNAM_HOLIDAYS dataset', () => {
  it('contains the four fixed national holidays for 2026', () => {
    const ids = VIETNAM_HOLIDAYS.filter((h) => h.date.startsWith('2026-')).map((h) => h.id);
    expect(ids).toContain('2026-new-year');
    expect(ids).toContain('2026-reunification');
    expect(ids).toContain('2026-labor');
    expect(ids).toContain('2026-national');
  });

  it('covers 5 years (2026-2030)', () => {
    const years = new Set(VIETNAM_HOLIDAYS.map((h) => h.date.slice(0, 4)));
    expect(years).toEqual(new Set(['2026', '2027', '2028', '2029', '2030']));
  });

  it('marks Tết Mùng 1 as travel-heavy in every year', () => {
    const tetEntries = VIETNAM_HOLIDAYS.filter((h) => h.id.endsWith('-tet-day-1'));
    expect(tetEntries).toHaveLength(5);
    for (const entry of tetEntries) {
      expect(entry.kind).toBe('travel-heavy');
    }
  });

  it('every entry has both Vietnamese and English names', () => {
    for (const h of VIETNAM_HOLIDAYS) {
      expect(h.nameVi.length).toBeGreaterThan(0);
      expect(h.nameEn.length).toBeGreaterThan(0);
    }
  });

  it('entries are sorted by date ascending', () => {
    const dates = VIETNAM_HOLIDAYS.map((h) => h.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

describe('isHoliday', () => {
  it('returns the holiday for a known fixed date', () => {
    expect(isHoliday(vnDate('2026-04-30'))?.id).toBe('2026-reunification');
    expect(isHoliday(vnDate('2026-09-02'))?.id).toBe('2026-national');
    expect(isHoliday(vnDate('2027-01-01'))?.id).toBe('2027-new-year');
  });

  it('returns the Tết entry for Mùng 1 in 2026 (Feb 17)', () => {
    expect(isHoliday(vnDate('2026-02-17'))?.id).toBe('2026-tet-day-1');
  });

  it('returns null for a non-holiday date', () => {
    expect(isHoliday(vnDate('2026-03-15'))).toBeNull();
  });

  it('uses Asia/Ho_Chi_Minh timezone — Apr 30 at 23:30 UTC is May 1 in VN, so still hits May 1 not Apr 30', () => {
    // 2026-04-30T23:30:00Z = 2026-05-01T06:30 VN time → not Reunification Day
    const utcLateApr30 = new Date('2026-04-30T23:30:00Z');
    expect(isHoliday(utcLateApr30)?.id).toBe('2026-labor');
  });
});

describe('isHolidayWindow', () => {
  it('returns true for the day before, of, and after a travel-heavy holiday', () => {
    expect(isHolidayWindow(vnDate('2026-04-29'))).toBe(true); // day before
    expect(isHolidayWindow(vnDate('2026-04-30'))).toBe(true); // day of
    expect(isHolidayWindow(vnDate('2026-05-01'))).toBe(true); // day after (also Labor Day)
  });

  it('returns false for dates well outside any holiday window', () => {
    expect(isHolidayWindow(vnDate('2026-03-15'))).toBe(false);
    expect(isHolidayWindow(vnDate('2026-07-04'))).toBe(false);
  });

  it('respects custom daysAround radius', () => {
    // 5 days before 30/4 — outside default radius (1) but inside radius 5
    expect(isHolidayWindow(vnDate('2026-04-25'), 1)).toBe(false);
    expect(isHolidayWindow(vnDate('2026-04-25'), 5)).toBe(true);
  });
});

describe('nextHoliday', () => {
  it('returns the next chronological holiday after a given date', () => {
    const next = nextHoliday(vnDate('2026-03-15'));
    expect(next?.date).toBe('2026-04-06'); // Giỗ Tổ Hùng Vương 2026 (10/3 lunar)
  });

  it('returns the New Year holiday when called late in a year', () => {
    const next = nextHoliday(vnDate('2026-12-25'));
    expect(next?.id).toBe('2027-new-year');
  });

  it('returns null when no future holiday is in the dataset', () => {
    expect(nextHoliday(vnDate('2031-01-01'))).toBeNull();
  });
});
