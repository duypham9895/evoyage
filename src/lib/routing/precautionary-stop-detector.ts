import type { PrecautionaryReason } from '@/types';
import type { BackupPressureResult, BackupPressureSignals } from './backup-pressure';

export interface PrecautionaryLegPressure {
  readonly legIndex: number;
  readonly pressure: BackupPressureResult;
  readonly legDistanceKm?: number;
  readonly downstreamStationCount?: number;
}

export interface PrecautionaryInjectionSite {
  readonly legIndex: number;
  readonly pressureScore: number;
  readonly reason: PrecautionaryReason;
  readonly reasonSecondary: readonly PrecautionaryReason[];
  readonly signals: BackupPressureSignals;
  readonly legDistanceKm: number;
  readonly legSparsityCount: number;
  readonly safetyFactor: number;
  readonly vehicleBatteryKwh: number;
}

export interface FindInjectionSitesInput {
  readonly legs: readonly PrecautionaryLegPressure[];
  readonly rangeSafetyFactor: number;
  readonly vehicleBatteryKwh?: number;
  readonly existingPrecautionaryCount?: number;
  readonly maxPrecautionaryStops?: number;
}

const DEFAULT_MAX_PRECAUTIONARY_STOPS = 2;

export function injectionThresholdForSafetyFactor(rangeSafetyFactor: number): number {
  if (rangeSafetyFactor <= 0.70) return 5;
  if (rangeSafetyFactor <= 0.80) return 4;
  return 3;
}

function primaryReason(signals: BackupPressureSignals): PrecautionaryReason {
  if (signals.holiday) return 'holiday';
  if (signals.sparseArea) return 'sparse';
  if (signals.peakWindow) return 'peak';
  if (signals.tightMargin) return 'tightMargin';
  return 'lowBuffer';
}

function activeReasons(signals: BackupPressureSignals): readonly PrecautionaryReason[] {
  const reasons: PrecautionaryReason[] = [];
  if (signals.holiday) reasons.push('holiday');
  if (signals.sparseArea) reasons.push('sparse');
  if (signals.peakWindow) reasons.push('peak');
  if (signals.tightMargin) reasons.push('tightMargin');
  if (signals.lowBuffer) reasons.push('lowBuffer');
  return reasons;
}

export function findInjectionSites(
  input: FindInjectionSitesInput,
): readonly PrecautionaryInjectionSite[] {
  const maxStops = input.maxPrecautionaryStops ?? DEFAULT_MAX_PRECAUTIONARY_STOPS;
  const remaining = Math.max(0, maxStops - (input.existingPrecautionaryCount ?? 0));
  if (remaining === 0) return [];

  const threshold = injectionThresholdForSafetyFactor(input.rangeSafetyFactor);
  const sites: PrecautionaryInjectionSite[] = [];

  for (const leg of input.legs) {
    if (leg.pressure.score < threshold) continue;

    const reason = primaryReason(leg.pressure.signals);
    sites.push({
      legIndex: leg.legIndex,
      pressureScore: leg.pressure.score,
      reason,
      reasonSecondary: activeReasons(leg.pressure.signals).filter((candidate) => candidate !== reason),
      signals: leg.pressure.signals,
      legDistanceKm: leg.legDistanceKm ?? 0,
      legSparsityCount: leg.downstreamStationCount ?? 0,
      safetyFactor: input.rangeSafetyFactor,
      vehicleBatteryKwh: input.vehicleBatteryKwh ?? 0,
    });

    if (sites.length === remaining) break;
  }

  return sites;
}
