import type { LatLng } from '@/types';
import { decodePolyline, cumulativeDistances } from '@/lib/polyline';
import { haversineDistance } from '@/lib/station-finder';

// ── Types ──

export interface ElevationPoint {
  readonly distanceKm: number;
  readonly elevationM: number;
  readonly lngLat: [number, number];
  readonly gradient: number; // percentage
}

export interface SteepSection {
  readonly startIdx: number;
  readonly endIdx: number;
}

export interface ElevationProfile {
  readonly points: readonly ElevationPoint[];
  readonly totalAscentM: number;
  readonly totalDescentM: number;
  readonly maxGradientPercent: number;
  readonly maxElevationM: number;
  readonly minElevationM: number;
  readonly shouldDisplay: boolean;
  readonly steepSections: readonly SteepSection[];
}

// ── Constants ──

const STEEP_GRADIENT_THRESHOLD = 5; // percent
const SIGNIFICANT_ASCENT_M = 500;

// ── Public API ──

/**
 * Sample points evenly along an encoded polyline at a given interval.
 * Returns an array of [lng, lat] tuples with their cumulative distance.
 */
export function samplePolylinePoints(
  encodedPolyline: string,
  intervalKm: number,
  precision: 5 | 6 = 5,
): readonly { readonly distanceKm: number; readonly lngLat: [number, number] }[] {
  if (!encodedPolyline || intervalKm <= 0) {
    return [];
  }

  const decoded = decodePolyline(encodedPolyline, precision);
  if (decoded.length === 0) {
    return [];
  }

  if (decoded.length === 1) {
    return [{ distanceKm: 0, lngLat: [decoded[0].lng, decoded[0].lat] }];
  }

  const cumDist = cumulativeDistances(decoded, haversineDistance);
  const totalDistance = cumDist[cumDist.length - 1];

  if (totalDistance === 0) {
    return [{ distanceKm: 0, lngLat: [decoded[0].lng, decoded[0].lat] }];
  }

  const sampled: { readonly distanceKm: number; readonly lngLat: [number, number] }[] = [];

  // Always include the first point
  sampled.push({ distanceKm: 0, lngLat: [decoded[0].lng, decoded[0].lat] });

  let nextTargetKm = intervalKm;
  let segmentIdx = 0;

  while (nextTargetKm < totalDistance) {
    // Advance to the segment containing nextTargetKm
    while (segmentIdx < cumDist.length - 1 && cumDist[segmentIdx + 1] < nextTargetKm) {
      segmentIdx++;
    }

    if (segmentIdx >= cumDist.length - 1) {
      break;
    }

    // Interpolate within the segment
    const segStart = cumDist[segmentIdx];
    const segEnd = cumDist[segmentIdx + 1];
    const segLength = segEnd - segStart;
    const fraction = segLength > 0 ? (nextTargetKm - segStart) / segLength : 0;

    const p1 = decoded[segmentIdx];
    const p2 = decoded[segmentIdx + 1];
    const interpLat = p1.lat + fraction * (p2.lat - p1.lat);
    const interpLng = p1.lng + fraction * (p2.lng - p1.lng);

    sampled.push({
      distanceKm: nextTargetKm,
      lngLat: [interpLng, interpLat],
    });

    nextTargetKm += intervalKm;
  }

  // Always include the last point
  const lastPt = decoded[decoded.length - 1];
  const lastDist = cumDist[cumDist.length - 1];
  if (sampled[sampled.length - 1].distanceKm < lastDist - 0.001) {
    sampled.push({
      distanceKm: lastDist,
      lngLat: [lastPt.lng, lastPt.lat],
    });
  }

  return sampled;
}

/**
 * Apply a 3-point moving average to smooth elevation noise.
 * Null values are treated as gaps — they remain null.
 */
export function smoothElevations(
  elevations: readonly (number | null)[],
): readonly (number | null)[] {
  if (elevations.length <= 2) {
    return elevations;
  }

  return elevations.map((val, i) => {
    if (val === null) return null;

    // First and last points: no smoothing
    if (i === 0 || i === elevations.length - 1) return val;

    const prev = elevations[i - 1];
    const next = elevations[i + 1];

    if (prev === null || next === null) return val;

    return (prev + val + next) / 3;
  });
}

/**
 * Calculate gradient percentage between two consecutive elevation points.
 * gradient = (Δelevation / Δdistance) * 100
 */
function calculateGradient(
  elevDiffM: number,
  distDiffKm: number,
): number {
  if (distDiffKm <= 0) return 0;
  const distM = distDiffKm * 1000;
  return (elevDiffM / distM) * 100;
}

/**
 * Build a complete ElevationProfile from sampled points and their elevation values.
 *
 * @param sampledPoints - Output of samplePolylinePoints
 * @param elevations - Elevation in meters for each sampled point (null = unavailable)
 */
export function calculateElevationProfile(
  sampledPoints: readonly { readonly distanceKm: number; readonly lngLat: [number, number] }[],
  elevations: readonly (number | null)[],
): ElevationProfile {
  if (sampledPoints.length === 0 || elevations.length === 0) {
    return emptyProfile();
  }

  // Smooth raw elevations
  const smoothed = smoothElevations(elevations);

  // Build elevation points with gradient
  const points: ElevationPoint[] = [];
  let totalAscentM = 0;
  let totalDescentM = 0;
  let maxGradient = 0;
  let maxElev = -Infinity;
  let minElev = Infinity;

  for (let i = 0; i < sampledPoints.length; i++) {
    const elev = smoothed[i];
    if (elev === null) continue;

    let gradient = 0;
    if (points.length > 0) {
      const prev = points[points.length - 1];
      const elevDiff = elev - prev.elevationM;
      const distDiff = sampledPoints[i].distanceKm - prev.distanceKm;
      gradient = calculateGradient(elevDiff, distDiff);

      if (elevDiff > 0) {
        totalAscentM += elevDiff;
      } else {
        totalDescentM += Math.abs(elevDiff);
      }

      maxGradient = Math.max(maxGradient, Math.abs(gradient));
    }

    if (elev > maxElev) maxElev = elev;
    if (elev < minElev) minElev = elev;

    points.push({
      distanceKm: sampledPoints[i].distanceKm,
      elevationM: elev,
      lngLat: sampledPoints[i].lngLat,
      gradient,
    });
  }

  if (points.length === 0) {
    return emptyProfile();
  }

  // Fix edge case: single point
  if (maxElev === -Infinity) maxElev = 0;
  if (minElev === Infinity) minElev = 0;

  // Detect steep sections (consecutive points with gradient >5%)
  const steepSections = detectSteepSections(points);

  const shouldDisplay =
    maxGradient > STEEP_GRADIENT_THRESHOLD ||
    totalAscentM > SIGNIFICANT_ASCENT_M;

  return {
    points,
    totalAscentM: Math.round(totalAscentM),
    totalDescentM: Math.round(totalDescentM),
    maxGradientPercent: Math.round(maxGradient * 10) / 10,
    maxElevationM: Math.round(maxElev),
    minElevationM: Math.round(minElev),
    shouldDisplay,
    steepSections,
  };
}

/**
 * Detect contiguous steep sections where |gradient| > 5%.
 */
function detectSteepSections(
  points: readonly ElevationPoint[],
): readonly SteepSection[] {
  const sections: SteepSection[] = [];
  let sectionStart: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const isSteep = Math.abs(points[i].gradient) > STEEP_GRADIENT_THRESHOLD;

    if (isSteep && sectionStart === null) {
      sectionStart = i;
    } else if (!isSteep && sectionStart !== null) {
      sections.push({ startIdx: sectionStart, endIdx: i - 1 });
      sectionStart = null;
    }
  }

  // Close any open section at the end
  if (sectionStart !== null) {
    sections.push({ startIdx: sectionStart, endIdx: points.length - 1 });
  }

  return sections;
}

function emptyProfile(): ElevationProfile {
  return {
    points: [],
    totalAscentM: 0,
    totalDescentM: 0,
    maxGradientPercent: 0,
    maxElevationM: 0,
    minElevationM: 0,
    shouldDisplay: false,
    steepSections: [],
  };
}
