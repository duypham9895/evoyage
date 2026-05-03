/**
 * Detect which Vietnamese mountain passes a route's polyline crosses.
 *
 * Reads from the static KNOWN_VIETNAM_PASSES dataset (no API calls).
 * Checks every decoded point against each pass bbox. Cost is trivial:
 * a 500-point polyline × 5 passes × 4 comparisons = 10k ops, microseconds.
 *
 * Returns at most 3 passes — UI doesn't render more, and capping keeps
 * the timeline-overlay area predictable.
 */
import { decodePolyline } from '@/lib/geo/polyline';
import type { LatLng } from '@/types';
import { KNOWN_VIETNAM_PASSES, type VietnamPass } from './known-passes';

const MAX_RESULTS = 3;

function isInsideBbox(point: LatLng, bbox: readonly [number, number, number, number]): boolean {
  const [latMin, latMax, lngMin, lngMax] = bbox;
  return (
    point.lat >= latMin &&
    point.lat <= latMax &&
    point.lng >= lngMin &&
    point.lng <= lngMax
  );
}

export function detectPasses(polyline: string): readonly VietnamPass[] {
  if (!polyline) return [];

  let points: readonly LatLng[];
  try {
    points = decodePolyline(polyline);
  } catch {
    return [];
  }

  if (points.length === 0) return [];

  const detected: VietnamPass[] = [];
  for (const pass of KNOWN_VIETNAM_PASSES) {
    if (detected.length >= MAX_RESULTS) break;
    const hit = points.some((p) => isInsideBbox(p, pass.bbox));
    if (hit) detected.push(pass);
  }

  return detected;
}
