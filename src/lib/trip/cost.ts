/**
 * Trip cost transparency — pure helpers for estimating EV charging cost
 * vs equivalent gasoline cost in Vietnamese Dong (VND).
 *
 * All numbers are rough public-rate estimates; not authoritative billing.
 */

/** EVN public DC charging rate (VinFast / Vsmart) — VND per kWh, HCMC 2026. */
export const DEFAULT_VND_PER_KWH = 3500;

/** Average sedan gasoline consumption — liters per 100 km. */
export const DEFAULT_GASOLINE_L_PER_100KM = 7;

/** RON95 retail price in HCMC — VND per liter. */
export const DEFAULT_VND_PER_LITER = 23000;

/**
 * Estimate electricity cost (VND) to drive `distanceKm` for a vehicle
 * with the given energy efficiency in Wh/km.
 *
 * Returns 0 when distance, efficiency, or rate is non-positive
 * (caller should treat the result as "unknown" and hide UI).
 */
export function calculateElectricityCostVnd(
  distanceKm: number,
  efficiencyWhPerKm: number,
  vndPerKwh: number = DEFAULT_VND_PER_KWH,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (!Number.isFinite(efficiencyWhPerKm) || efficiencyWhPerKm <= 0) return 0;
  if (!Number.isFinite(vndPerKwh) || vndPerKwh <= 0) return 0;

  const kwh = (distanceKm * efficiencyWhPerKm) / 1000;
  return Math.round(kwh * vndPerKwh);
}

/**
 * Estimate equivalent gasoline cost (VND) for the same distance,
 * using a representative sedan consumption profile.
 */
export function calculateGasolineEquivalentVnd(
  distanceKm: number,
  gasolineL100km: number = DEFAULT_GASOLINE_L_PER_100KM,
  vndPerLiter: number = DEFAULT_VND_PER_LITER,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (!Number.isFinite(gasolineL100km) || gasolineL100km <= 0) return 0;
  if (!Number.isFinite(vndPerLiter) || vndPerLiter <= 0) return 0;

  const liters = (distanceKm * gasolineL100km) / 100;
  return Math.round(liters * vndPerLiter);
}

export interface SavingsResult {
  readonly savedVnd: number;
  readonly savedPercent: number;
}

/**
 * Compute absolute savings (gasoline − electricity) and the percent saved
 * relative to gasoline cost. Negative savings (EV more expensive) are
 * returned as-is so callers can decide how to display.
 *
 * When gasolineCost is 0 (or invalid), returns zero savings rather than NaN/Infinity.
 */
export function calculateSavings(
  electricityCost: number,
  gasolineCost: number,
): SavingsResult {
  const safeElec = Number.isFinite(electricityCost) ? electricityCost : 0;
  const safeGas = Number.isFinite(gasolineCost) ? gasolineCost : 0;

  const savedVnd = safeGas - safeElec;

  if (safeGas <= 0) {
    return { savedVnd: 0, savedPercent: 0 };
  }

  const savedPercent = Math.round((savedVnd / safeGas) * 100);
  return { savedVnd, savedPercent };
}

/**
 * Format a VND value using Vietnamese conventions: dot thousand separators
 * and a trailing ₫ symbol. Negative values keep their sign.
 *
 * Examples:
 *   formatVnd(0)        → "0 ₫"
 *   formatVnd(1234)     → "1.234 ₫"
 *   formatVnd(1234567)  → "1.234.567 ₫"
 *   formatVnd(-500)     → "-500 ₫"
 */
export function formatVnd(value: number): string {
  if (!Number.isFinite(value)) return '0 ₫';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded).toString();
  // Insert a dot every three digits from the right.
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped} ₫`;
}
