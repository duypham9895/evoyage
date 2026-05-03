/**
 * Cluster MISSING_STATION feedback reports into "candidate stations" for
 * crowdsourced auto-promotion.
 *
 * Rules:
 *  - Two reports are "close" when their haversine distance is ≤ 50m.
 *  - A cluster only qualifies if it contains ≥ 3 reports AND ≥ 3 distinct
 *    `ipHash` values (anti-spam — one user repeatedly submitting from the
 *    same coordinates does not qualify).
 *  - Pairwise rule, not single-link: every report in the cluster must be
 *    within 50m of every other. This avoids chaining a 200m-wide string of
 *    reports through transitive 40m hops.
 *
 * The clustering algorithm is greedy — for each unassigned report, take it
 * as anchor, then collect every other unassigned report that is within 50m
 * of every existing cluster member. Good enough for the volumes we expect
 * (tens to low hundreds of pending reports, not millions).
 */

import { haversineMeters } from './dedup';

const CLUSTER_RADIUS_M = 50;
const MIN_REPORTS_FOR_CLUSTER = 3;
const MIN_UNIQUE_IPS_FOR_CLUSTER = 3;
const FALLBACK_STATION_NAME = 'Community-reported station';

export interface FeedbackPoint {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly ipHash: string;
  readonly stationName: string;
  readonly description: string;
  readonly proposedProvider: string | null;
}

export interface CandidateStation {
  readonly memberIds: ReadonlyArray<string>;
  readonly members: ReadonlyArray<FeedbackPoint>;
  readonly centroid: { latitude: number; longitude: number };
  readonly name: string;
  readonly address: string;
  readonly provider: string;
}

function modeOf<T>(values: T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T = fallback;
  let bestCount = 0;
  for (const [v, c] of counts.entries()) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return bestCount > 0 ? best : fallback;
}

function buildCandidate(members: FeedbackPoint[]): CandidateStation {
  const centroid = {
    latitude: members.reduce((s, m) => s + m.latitude, 0) / members.length,
    longitude: members.reduce((s, m) => s + m.longitude, 0) / members.length,
  };
  const names = members.map((m) => m.stationName?.trim()).filter((n): n is string => Boolean(n));
  const name = modeOf(names, '') || FALLBACK_STATION_NAME;
  const address = members
    .map((m) => m.description?.trim() ?? '')
    .filter(Boolean)
    .reduce((longest, current) => (current.length > longest.length ? current : longest), '');
  const providers = members
    .map((m) => m.proposedProvider?.trim() ?? null)
    .filter((p): p is string => Boolean(p));
  const provider = modeOf(providers, 'Community');

  return {
    memberIds: members.map((m) => m.id),
    members,
    centroid,
    name,
    address: address || 'Address pending verification',
    provider,
  };
}

function allWithinRadius(members: FeedbackPoint[], candidate: FeedbackPoint): boolean {
  for (const m of members) {
    const d = haversineMeters(
      { lat: m.latitude, lng: m.longitude },
      { lat: candidate.latitude, lng: candidate.longitude },
    );
    if (d > CLUSTER_RADIUS_M) return false;
  }
  return true;
}

export function clusterMissingStationFeedback(points: FeedbackPoint[]): CandidateStation[] {
  const remaining = [...points];
  const clusters: CandidateStation[] = [];

  while (remaining.length > 0) {
    const anchor = remaining.shift();
    if (!anchor) break;
    const members: FeedbackPoint[] = [anchor];

    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const candidate = remaining[i];
      if (allWithinRadius(members, candidate)) {
        members.push(candidate);
        remaining.splice(i, 1);
      }
    }

    if (members.length < MIN_REPORTS_FOR_CLUSTER) continue;
    const uniqueIps = new Set(members.map((m) => m.ipHash));
    if (uniqueIps.size < MIN_UNIQUE_IPS_FOR_CLUSTER) continue;

    clusters.push(buildCandidate(members));
  }

  return clusters;
}
