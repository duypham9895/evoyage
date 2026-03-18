import type {
  ChargingStationData,
  RankedStation,
  ScoreStationInput,
  ScoredStation,
} from '@/types';

// ── Constants ──
const CHARGING_EFFICIENCY_FACTOR = 1.15;
const VINFAST_BONUS_CAP = 0.5;
const OK_RANK_THRESHOLD = 1.5;

const CONNECTOR_POWER_MAP: Readonly<Record<string, number>> = {
  CCS2: 100,
  CHAdeMO: 50,
  Type2_AC: 22,
  Type1: 7,
};

const DEFAULT_POWER_KW = 50;

/**
 * Returns default power (kW) based on connector types.
 * Multiple connectors → highest power wins.
 */
export function getDefaultPowerKw(
  connectorTypes: readonly string[],
): number {
  if (connectorTypes.length === 0) {
    return DEFAULT_POWER_KW;
  }

  const powers = connectorTypes.map(
    (c) => CONNECTOR_POWER_MAP[c] ?? DEFAULT_POWER_KW,
  );

  return Math.max(...powers);
}

/**
 * Returns effective charging power: min(station power, vehicle max).
 * Falls back to connector-based default when station.maxPowerKw is falsy/0.
 */
export function getEffectivePowerKw(
  station: ChargingStationData,
  vehicleMaxChargeKw?: number,
): number {
  const stationPower =
    station.maxPowerKw || getDefaultPowerKw(station.connectorTypes);

  if (vehicleMaxChargeKw && vehicleMaxChargeKw > 0) {
    return Math.min(stationPower, vehicleMaxChargeKw);
  }

  return stationPower;
}

/**
 * Estimates charging time in minutes, including efficiency overhead.
 */
export function calculateChargeTimeMin(
  energyNeededKwh: number,
  effectivePowerKw: number,
): number {
  if (effectivePowerKw <= 0) {
    return 0;
  }

  return (energyNeededKwh / effectivePowerKw) * 60 * CHARGING_EFFICIENCY_FACTOR;
}

/**
 * Scores a station based on detour time, charging time, and VinFast affinity.
 * Lower score = better station.
 */
export function scoreStation(input: ScoreStationInput): ScoredStation {
  const effectivePower = input.vehicleMaxChargeKw
    ? Math.min(input.stationPowerKw, input.vehicleMaxChargeKw)
    : input.stationPowerKw;

  const estimatedChargeTimeMin = calculateChargeTimeMin(
    input.energyNeededKwh,
    effectivePower,
  );

  const detourTimeMin = input.detourDriveTimeSec / 60;
  const totalStopTimeMin = detourTimeMin + estimatedChargeTimeMin;

  let score = totalStopTimeMin;

  // VinFast bonus: reduce score when both vehicle and station are VinFast
  if (input.isVinFastStation && input.isVinFastVehicle) {
    const bonus = Math.min(score * VINFAST_BONUS_CAP, score * VINFAST_BONUS_CAP);
    score = score - bonus;
  }

  return {
    station: input.station,
    detourDriveTimeSec: input.detourDriveTimeSec,
    estimatedChargeTimeMin,
    totalStopTimeMin,
    score,
  };
}

/**
 * Ranks scored stations: best, ok, or slow.
 * Tiebreaker: higher portCount > known operatingHours > non-VinFast-exclusive.
 */
export function rankStations(
  scored: readonly ScoredStation[],
): readonly RankedStation[] {
  if (scored.length === 0) {
    return [];
  }

  const sorted = [...scored].sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }

    // Tiebreaker 1: higher portCount is better
    if (a.station.portCount !== b.station.portCount) {
      return b.station.portCount - a.station.portCount;
    }

    // Tiebreaker 2: known operatingHours is better
    const aHasHours = a.station.operatingHours !== null ? 1 : 0;
    const bHasHours = b.station.operatingHours !== null ? 1 : 0;
    if (aHasHours !== bHasHours) {
      return bHasHours - aHasHours;
    }

    // Tiebreaker 3: non-VinFast-exclusive is better (more accessible)
    if (a.station.isVinFastOnly !== b.station.isVinFastOnly) {
      return a.station.isVinFastOnly ? 1 : -1;
    }

    return 0;
  });

  const bestScore = sorted[0].score;
  const okThreshold = bestScore * OK_RANK_THRESHOLD;

  return sorted.map((s) => {
    let rank: 'best' | 'ok' | 'slow';
    if (s.score === bestScore) {
      rank = 'best';
    } else if (s.score <= okThreshold) {
      rank = 'ok';
    } else {
      rank = 'slow';
    }

    return {
      station: s.station,
      detourDriveTimeSec: s.detourDriveTimeSec,
      estimatedChargeTimeMin: s.estimatedChargeTimeMin,
      totalStopTimeMin: s.totalStopTimeMin,
      rank,
      score: s.score,
    };
  });
}
