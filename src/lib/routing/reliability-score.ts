/**
 * Reliability multiplier for scoreStation, per ADR-0007.
 *
 * Stations below the observation threshold are gated (multiplier = 1.0,
 * no penalty) — we don't yet have enough data to penalize them. Above the
 * threshold, the multiplier is linear: `2 - reliability`, ∈ [1.0, 2.0].
 */

export interface ReliabilityRecord {
  readonly reliability: number;
  readonly observationCount: number;
}

export const RELIABILITY_THRESHOLD = 100;

export function reliabilityMultiplier(
  record: ReliabilityRecord | null | undefined,
): number {
  if (!record) return 1.0;
  if (record.observationCount < RELIABILITY_THRESHOLD) return 1.0;
  return 2 - record.reliability;
}
