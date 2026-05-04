/**
 * Build a Google Maps directions URL for handing off a planned trip.
 *
 * Why lat/lng for origin & destination (not the user-typed labels):
 * Google Maps geocodes free-text labels with strong location bias to the
 * user's current region. In Vietnam that means the label "Đà Lạt" can resolve
 * to a Saigon restaurant called "Đà Lạt Năm Xưa" instead of the actual city
 * 300km north — making GMaps draw an absurd "drive north, then back south"
 * route. Passing exact lat/lng eliminates the ambiguity.
 *
 * Charging stops are passed through `waypoints=` in plan order so GMaps routes
 * the driver through them instead of treating each as a separate detour.
 */

import type { TripPlan } from '@/types';

export function buildGoogleMapsUrl(plan: TripPlan): string {
  const origin = `${plan.startCoord.lat},${plan.startCoord.lng}`;
  const destination = `${plan.endCoord.lat},${plan.endCoord.lng}`;

  const waypoints = plan.chargingStops.map((stop) => {
    const station = 'selected' in stop ? stop.selected.station : stop.station;
    return `${station.latitude},${station.longitude}`;
  }).join('|');

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });

  if (waypoints) {
    params.set('waypoints', waypoints);
  }

  return `https://www.google.com/maps/dir/?${params}`;
}
