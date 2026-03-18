// ── Range Safety Factor Constants ──
export const DEFAULT_RANGE_SAFETY_FACTOR = 0.80;
export const MIN_RANGE_SAFETY_FACTOR = 0.50;
export const MAX_RANGE_SAFETY_FACTOR = 1.00;
export const WARNING_THRESHOLD = 0.80;
export const CONFIRMATION_THRESHOLD = 0.95;
export const SAFETY_BUFFER_KM = 30;
export const CHARGE_TARGET_PERCENT = 80;
export const DEFAULT_CURRENT_BATTERY = 80;
export const DEFAULT_MIN_ARRIVAL = 15;

// ── Vehicle Types ──
export interface EVVehicleData {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly variant: string | null;
  readonly modelYear: number | null;
  readonly bodyType: string;
  readonly segment: string | null;
  readonly seats: number;
  readonly doors: number | null;
  readonly batteryCapacityKwh: number;
  readonly usableBatteryKwh: number | null;
  readonly officialRangeKm: number;
  readonly rangeStandard: string | null;
  readonly efficiencyWhPerKm: number | null;
  readonly dcMaxChargingPowerKw: number | null;
  readonly acChargingPowerKw: number | null;
  readonly chargingTimeDC_10to80_min: number | null;
  readonly chargingPortType: string | null;
  readonly powerKw: number | null;
  readonly torqueNm: number | null;
  readonly driveType: string | null;
  readonly acceleration0to100: number | null;
  readonly topSpeedKmh: number | null;
  readonly lengthMm: number | null;
  readonly widthMm: number | null;
  readonly heightMm: number | null;
  readonly wheelbaseMm: number | null;
  readonly weightKg: number | null;
  readonly cargoVolumeLiters: number | null;
  readonly availableInVietnam: boolean;
  readonly priceVndMillions: number | null;
  readonly source: string;
  readonly isUserAdded: boolean;
}

export interface CustomVehicleInput {
  readonly brand: string;
  readonly model: string;
  readonly batteryCapacityKwh: number;
  readonly officialRangeKm: number;
  readonly chargingTimeDC_10to80_min?: number;
  readonly chargingPortType?: string;
}

// ── Range Calculation Types ──
export interface RangeResult {
  readonly maxRangeKm: number;
  readonly usableRangeKm: number;
  readonly explanation: string;
}

export type SafetyLevel = 'safe' | 'caution' | 'warning' | 'danger';

export interface RangeSafetyWarning {
  readonly level: SafetyLevel;
  readonly messageVi: string;
  readonly messageEn: string;
  readonly color: string;
}

// ── Charging Station Types ──
export interface ChargingStationData {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly province: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly chargerTypes: readonly string[];
  readonly connectorTypes: readonly string[];
  readonly portCount: number;
  readonly maxPowerKw: number;
  readonly stationType: 'public' | 'private';
  readonly isVinFastOnly: boolean;
  readonly operatingHours: string | null;
  readonly provider: string;
}

// ── Route Planning Types ──
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface ChargingStop {
  readonly station: ChargingStationData;
  readonly distanceFromStartKm: number;
  readonly arrivalBatteryPercent: number;
  readonly departureBatteryPercent: number;
  readonly estimatedChargingTimeMin: number;
}

export interface NoStationWarning {
  readonly type: 'NO_COMPATIBLE_STATION';
  readonly distanceFromStartKm: number;
  readonly messageVi: string;
  readonly messageEn: string;
}

export interface BatterySegment {
  readonly startKm: number;
  readonly endKm: number;
  readonly startBatteryPercent: number;
  readonly endBatteryPercent: number;
  readonly label: string;
}

export interface TripPlan {
  readonly totalDistanceKm: number;
  readonly totalDurationMin: number;
  readonly chargingStops: readonly (ChargingStop | ChargingStopWithAlternatives)[];
  readonly warnings: readonly NoStationWarning[];
  readonly batterySegments: readonly BatterySegment[];
  readonly arrivalBatteryPercent: number;
  readonly totalChargingTimeMin: number;
  readonly polyline: string;
  readonly startAddress: string;
  readonly endAddress: string;
  readonly tripId?: string;
}

export type MapMode = 'osm' | 'mapbox' | 'google';

// ── Vehicle Search/Filter Types ──
export interface VehicleSearchParams {
  readonly query?: string;
  readonly vietnamOnly?: boolean;
  readonly bodyType?: string;
  readonly seats?: number;
  readonly brand?: string;
  readonly minRangeKm?: number;
}

// ── Locale ──
export type Locale = 'vi' | 'en';

// ── Smart Station Ranking Types ──
export interface RankedStation {
  readonly station: ChargingStationData;
  readonly detourDriveTimeSec: number;
  readonly estimatedChargeTimeMin: number;
  readonly totalStopTimeMin: number;
  readonly rank: 'best' | 'ok' | 'slow';
  readonly score: number;
}

export interface ChargingStopWithAlternatives {
  readonly selected: RankedStation;
  readonly alternatives: readonly RankedStation[];
  readonly distanceAlongRouteKm: number;
  readonly batteryPercentAtArrival: number;
  readonly batteryPercentAfterCharge: number;
}

export interface ScoreStationInput {
  readonly detourDriveTimeSec: number;
  readonly stationPowerKw: number;
  readonly energyNeededKwh: number;
  readonly isVinFastStation: boolean;
  readonly isVinFastVehicle: boolean;
  readonly vehicleMaxChargeKw?: number;
  readonly station: ChargingStationData;
}

/** Extract station data from either ChargingStop or ChargingStopWithAlternatives */
export function getStopStation(stop: ChargingStop | ChargingStopWithAlternatives): ChargingStationData {
  return 'selected' in stop ? stop.selected.station : stop.station;
}

export function getStopDistance(stop: ChargingStop | ChargingStopWithAlternatives): number {
  return 'selected' in stop ? stop.distanceAlongRouteKm : stop.distanceFromStartKm;
}

// ── VinFast Station Detail (OCPI) ──
export interface VinFastDetailResponse {
  readonly detail: VinFastStationDetailData | null;
  readonly cached: boolean;
  readonly fallback?: boolean;
  readonly station: {
    readonly id: string;
    readonly name: string;
    readonly provider: string;
    readonly address?: string;
    readonly maxPowerKw?: number;
    readonly connectorTypes?: readonly string[];
    readonly portCount?: number;
  };
}

export interface VinFastStationDetailData {
  readonly entityId: string;
  readonly storeId: string;
  readonly name: string;
  readonly address: string;
  readonly province: string;
  readonly district: string;
  readonly commune: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly evses: ReadonlyArray<{
    readonly connectors: ReadonlyArray<{
      readonly standard: string;
      readonly format: string;
      readonly power_type: string;
      readonly max_electric_power: number;
    }>;
    readonly physical_reference: string;
    readonly last_updated: string;
  }>;
  readonly images: ReadonlyArray<{ readonly url: string; readonly category: string }>;
  readonly depotStatus: string;
  readonly is24h: boolean;
  readonly chargingWhenClosed: boolean;
  readonly parkingFee: boolean;
  readonly accessType: string;
  readonly hardwareStations: ReadonlyArray<{
    readonly code: string;
    readonly vendor: string;
    readonly maxPower: number;
    readonly modelCode: string;
  }>;
  readonly connectorSummary: readonly string[];
  readonly maxPowerKw: number;
  readonly portCount: number;
  readonly fetchedAt: string;
}

export interface ScoredStation {
  readonly station: ChargingStationData;
  readonly detourDriveTimeSec: number;
  readonly estimatedChargeTimeMin: number;
  readonly totalStopTimeMin: number;
  readonly score: number;
}
