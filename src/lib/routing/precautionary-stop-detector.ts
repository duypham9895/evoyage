import type { PrecautionaryReason } from '@/types';
import type { BackupPressureResult, BackupPressureSignals } from './backup-pressure';

export interface PrecautionaryLegPressure {
  readonly legIndex: number;
  readonly pressure: BackupPressureResult;
}

export interface PrecautionaryInjectionSite {
  readonly legIndex: number;
  readonly pressureScore: number;
  readonly reason: PrecautionaryReason;
  readonly signals: BackupPressureSignals;
}

export interface FindInjectionSitesInput {
  readonly legs: readonly PrecautionaryLegPressure[];
  readonly rangeSafetyFactor: number;
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

    sites.push({
      legIndex: leg.legIndex,
      pressureScore: leg.pressure.score,
      reason: primaryReason(leg.pressure.signals),
      signals: leg.pressure.signals,
    });

    if (sites.length === remaining) break;
  }

  return sites;
}
