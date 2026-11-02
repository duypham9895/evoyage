/**
 * Compute the per-trip energy cost in three lines (gasoline, diesel, electric)
 * scaled to the user's actual route distance.
 *
 * Used by the post-route cost panel in the trip view.
 */
import { getEnergyPrices, type EnergyPricesSnapshot } from './energy-prices';

/** Generic-sedan defaults. The footnote in the UI says "typical sedan". */
const GASOLINE_L_PER_100KM = 8;
const DIESEL_L_PER_100KM = 7;

/**
 * NEDC-to-real-world honesty multiplier for EV consumption derived from
 * battery÷range. Vietnam-sold VinFast specs use NEDC, which is optimistic by
 * roughly 20%. 1.2× brings the trip-cost number closer to what the customer
 * actually experiences.
 */
const NEDC_REAL_WORLD_MULTIPLIER = 1.2;

/** Fallback when battery and range are both unknown. Conservative VF 8 figure. */
const DEFAULT_KWH_PER_100KM = 22;

/** Default vehicle when the caller hasn't selected one — flagship VinFast SUV. */
const DEFAULT_VEHICLE: TripCostVehicle = {
  brand: 'VinFast',
  model: 'VF 8',
  usableBatteryKwh: 82,
  officialRangeKm: 471,
  rangeStandard: 'NEDC',
  efficiencyWhPerKm: null,
};

export interface TripCostVehicle {
  readonly brand: string;
  readonly model: string;
  readonly usableBatteryKwh: number | null;
  /** Gross battery (kWh). Used only when usableBatteryKwh is unknown (custom vehicles). */
  readonly batteryCapacityKwh?: number | null;
  readonly officialRangeKm: number;
  /** e.g. 'NEDC', 'WLTP'. For NEDC, a stored efficiency is the spec figure, not a measured one. */
  readonly rangeStandard?: string | null;
  readonly efficiencyWhPerKm: number | null;
}

export interface TripCost {
  readonly gasoline: { readonly liters: number; readonly vnd: number };
  readonly diesel: { readonly liters: number; readonly vnd: number };
  readonly electric: {
    readonly kwh: number;
    /** Cost charging at home using the EVN representative tier (₫). */
    readonly homeChargingVnd: number;
    /** Cost charging at V-GREEN at the published rate (₫). */
    readonly vGreenVnd: number;
    /**
     * True iff the vehicle is a VinFast AND today is before the free-charging
     * policy end date. UI shows "Free at V-GREEN" when this is true.
     */
    readonly isFreeAtVGreen: boolean;
  };
}

interface ComputeTripCostInput {
  readonly distanceKm: number;
  readonly vehicle?: TripCostVehicle;
  readonly snapshot?: EnergyPricesSnapshot;
  readonly today?: Date;
}

/** Usable battery when known, else gross battery (custom vehicles only have gross). */
function effectiveBatteryKwh(vehicle: TripCostVehicle): number | null {
  if (vehicle.usableBatteryKwh && vehicle.usableBatteryKwh > 0) return vehicle.usableBatteryKwh;
  if (vehicle.batteryCapacityKwh && vehicle.batteryCapacityKwh > 0) return vehicle.batteryCapacityKwh;
  return null;
}

function deriveKwhPer100km(vehicle: TripCostVehicle): number {
  const batteryKwh = effectiveBatteryKwh(vehicle);
  const derived =
    batteryKwh != null && vehicle.officialRangeKm > 0
      ? (batteryKwh / vehicle.officialRangeKm) * 100 * NEDC_REAL_WORLD_MULTIPLIER
      : null;
  // The catalog's NEDC efficiency is synthesised from battery÷range (seed
  // script), so it is not a measured figure: prefer the corrected derivation.
  const isNedc = vehicle.rangeStandard?.trim().toUpperCase() === 'NEDC';
  if (isNedc && derived != null) return derived;
  if (vehicle.efficiencyWhPerKm && vehicle.efficiencyWhPerKm > 0) {
    return vehicle.efficiencyWhPerKm / 10; // Wh/km → kWh/100km
  }
  return derived ?? DEFAULT_KWH_PER_100KM;
}

/**
 * Defense-in-depth: treat a non-finite or non-positive upstream price as
 * unknown (0) rather than letting it produce a NaN/negative cost. Mirrors the
 * guard in src/lib/trip/cost.ts. The parsers already reject implausible
 * values before they reach JSON (src/lib/energy-prices/plausibility.ts), so
 * this should only fire if that gate is ever bypassed.
 */
function safePrice(vndPerUnit: number): number {
  return Number.isFinite(vndPerUnit) && vndPerUnit > 0 ? vndPerUnit : 0;
}

function isVinFastFreeCharging(
  vehicle: TripCostVehicle,
  today: Date,
  freeUntil: string,
): boolean {
  if (vehicle.brand.trim().toLowerCase() !== 'vinfast') return false;
  const cutoff = Date.parse(freeUntil);
  if (Number.isNaN(cutoff)) return false;
  return today.getTime() <= cutoff;
}

export function computeTripCost(input: ComputeTripCostInput): TripCost {
  const distanceKm = Math.max(0, input.distanceKm);
  const vehicle = input.vehicle ?? DEFAULT_VEHICLE;
  const snapshot = input.snapshot ?? getEnergyPrices();
  const today = input.today ?? new Date();

  // Gasoline + diesel — generic sedan defaults
  const gasolineLiters = (distanceKm * GASOLINE_L_PER_100KM) / 100;
  const dieselLiters = (distanceKm * DIESEL_L_PER_100KM) / 100;
  const ron95iii = safePrice(snapshot.petrolimex.products.ron95iii?.vndPerLiter ?? 0);
  const do005s = safePrice(snapshot.petrolimex.products.do005s?.vndPerLiter ?? 0);

  // Electric — derived from the user's vehicle (or default), with NEDC honesty
  const kwhPer100km = deriveKwhPer100km(vehicle);
  const kwh = (distanceKm * kwhPer100km) / 100;
  const homeChargingVnd = kwh * safePrice(snapshot.evnResidential.representativeVndPerKwh);
  const vGreenVnd = kwh * safePrice(snapshot.vgreen.vndPerKwh);
  const isFreeAtVGreen = isVinFastFreeCharging(
    vehicle,
    today,
    snapshot.vgreen.freeForVinFastUntil,
  );

  return {
    gasoline: { liters: gasolineLiters, vnd: gasolineLiters * ron95iii },
    diesel: { liters: dieselLiters, vnd: dieselLiters * do005s },
    electric: {
      kwh,
      homeChargingVnd,
      vGreenVnd,
      isFreeAtVGreen,
    },
  };
}
