/**
 * Static dataset of major Vietnamese public holidays for 2026-2030, plus
 * helpers to detect holiday windows.
 *
 * Used by Phase 2's peak-hour heuristic to boost predicted traffic
 * around travel-heavy holidays (Tết, 30/4, 2/9). See
 * docs/specs/2026-05-03-phase-2-departure-intelligence-design.md §3e.
 *
 * Why a static dataset (not lunar runtime computation):
 * - Lunar-Gregorian conversion is fragile across timezones / library versions
 * - Vietnamese holiday observance is ultimately decreed by the Government;
 *   "official" days off can shift bridge days by ±1 vs the strict rule
 * - 5-year horizon is sufficient for a trip-planning app; regenerate annually
 *
 * `kind`:
 *   - travel-heavy: nationwide travel surge (Tết Mùng 1-3, 30/4, 2/9)
 *   - bridge-day:   day-off chained around a travel-heavy holiday
 *   - local:        observed but lower travel impact (Labor Day, Hùng Vương)
 *
 * Tết dates verified against Vietnam Government Office gazette:
 *   2026 → Feb 17 (Tuesday)
 *   2027 → Feb  6 (Saturday)
 *   2028 → Jan 26 (Wednesday)
 *   2029 → Feb 13 (Tuesday)
 *   2030 → Feb  3 (Sunday)
 *
 * Giỗ Tổ Hùng Vương = 10th day of 3rd lunar month:
 *   2026 → Apr  6
 *   2027 → Apr 26
 *   2028 → Apr 15
 *   2029 → Apr  4
 *   2030 → Apr 23
 */

export type HolidayKind = 'travel-heavy' | 'bridge-day' | 'local';

export interface VietnamHoliday {
  readonly id: string;
  readonly nameVi: string;
  readonly nameEn: string;
  /** Gregorian YYYY-MM-DD in Asia/Ho_Chi_Minh */
  readonly date: string;
  readonly kind: HolidayKind;
}

const HOLIDAYS_UNSORTED: VietnamHoliday[] = [];

// ── Fixed-date national holidays ──
function pushFixed(year: number) {
  HOLIDAYS_UNSORTED.push(
    { id: `${year}-new-year`,        nameVi: 'Tết Dương Lịch',         nameEn: "New Year's Day",      date: `${year}-01-01`, kind: 'local' },
    { id: `${year}-reunification`,   nameVi: 'Giải phóng miền Nam',    nameEn: 'Reunification Day',    date: `${year}-04-30`, kind: 'travel-heavy' },
    { id: `${year}-labor`,           nameVi: 'Quốc tế Lao động',       nameEn: 'Labor Day',            date: `${year}-05-01`, kind: 'travel-heavy' },
    { id: `${year}-national`,        nameVi: 'Quốc khánh',             nameEn: 'National Day',         date: `${year}-09-02`, kind: 'travel-heavy' },
  );
}

[2026, 2027, 2028, 2029, 2030].forEach(pushFixed);

// ── Tết Nguyên Đán: 5 days each year (Mùng 1 to Mùng 5) ──
const TET_DAY_1: Record<number, string> = {
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
  2029: '2029-02-13',
  2030: '2030-02-03',
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

for (const [yearStr, day1] of Object.entries(TET_DAY_1)) {
  const year = Number(yearStr);
  HOLIDAYS_UNSORTED.push({
    id: `${year}-tet-eve`,
    nameVi: 'Giao thừa',
    nameEn: 'Tết Eve',
    date: addDays(day1, -1),
    kind: 'travel-heavy',
  });
  for (let i = 0; i < 5; i++) {
    HOLIDAYS_UNSORTED.push({
      id: `${year}-tet-day-${i + 1}`,
      nameVi: `Mùng ${i + 1} Tết`,
      nameEn: `Tết Day ${i + 1}`,
      date: addDays(day1, i),
      kind: i < 3 ? 'travel-heavy' : 'bridge-day',
    });
  }
}

// ── Giỗ Tổ Hùng Vương (10/3 lunar) ──
const HUNG_KING: Record<number, string> = {
  2026: '2026-04-06',
  2027: '2027-04-26',
  2028: '2028-04-15',
  2029: '2029-04-04',
  2030: '2030-04-23',
};
for (const [yearStr, date] of Object.entries(HUNG_KING)) {
  HOLIDAYS_UNSORTED.push({
    id: `${yearStr}-hung-king`,
    nameVi: 'Giỗ Tổ Hùng Vương',
    nameEn: 'Hùng Kings Festival',
    date,
    kind: 'local',
  });
}

export const VIETNAM_HOLIDAYS: readonly VietnamHoliday[] = [...HOLIDAYS_UNSORTED].sort((a, b) =>
  a.date.localeCompare(b.date),
);

// ── Helpers ──

const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Convert a Date to its YYYY-MM-DD representation in Asia/Ho_Chi_Minh. */
function toVnDateIso(d: Date): string {
  return VN_DATE_FORMATTER.format(d);
}

export function isHoliday(date: Date): VietnamHoliday | null {
  const iso = toVnDateIso(date);
  return VIETNAM_HOLIDAYS.find((h) => h.date === iso) ?? null;
}

export function isHolidayWindow(date: Date, daysAround: number = 1): boolean {
  for (let offset = -daysAround; offset <= daysAround; offset++) {
    const probe = new Date(date.getTime() + offset * 86_400_000);
    if (isHoliday(probe)) return true;
  }
  return false;
}

export function nextHoliday(after: Date): VietnamHoliday | null {
  const afterIso = toVnDateIso(after);
  return VIETNAM_HOLIDAYS.find((h) => h.date > afterIso) ?? null;
}
