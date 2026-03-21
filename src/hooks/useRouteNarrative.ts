import { useState, useEffect, useRef, useCallback } from 'react';
import type { TripPlan } from '@/types';
import type { NarrativeResponse } from '@/app/api/route/narrative/route';

interface NarrativeState {
  readonly overview: string | null;
  readonly narrative: string | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

const INITIAL_STATE: NarrativeState = {
  overview: null,
  narrative: null,
  isLoading: false,
  error: null,
};

// In-memory + localStorage cache keyed by tripId
const memoryCache = new Map<string, { overview: string; narrative: string }>();

function getCachedNarrative(tripId: string): { overview: string; narrative: string } | null {
  // Check memory cache first
  const memHit = memoryCache.get(tripId);
  if (memHit) return memHit;

  // Check localStorage
  try {
    const stored = localStorage.getItem(`narrative:${tripId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as { overview: string; narrative: string };
      if (parsed.overview && parsed.narrative) {
        memoryCache.set(tripId, parsed);
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable or corrupt
  }

  return null;
}

function setCachedNarrative(tripId: string, data: { overview: string; narrative: string }): void {
  memoryCache.set(tripId, data);
  try {
    localStorage.setItem(`narrative:${tripId}`, JSON.stringify(data));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Fetches a route narrative for a trip plan.
 * Narrative loads asynchronously after the trip plan is ready.
 * Results are cached by tripId.
 */
export function useRouteNarrative(tripPlan: TripPlan | null): NarrativeState {
  const [state, setState] = useState<NarrativeState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const lastTripIdRef = useRef<string | null>(null);

  const fetchNarrative = useCallback(async (plan: TripPlan, signal: AbortSignal) => {
    const tripId = plan.tripId;

    // Check cache if tripId exists
    if (tripId) {
      const cached = getCachedNarrative(tripId);
      if (cached) {
        setState({
          overview: cached.overview,
          narrative: cached.narrative,
          isLoading: false,
          error: null,
        });
        return;
      }
    }

    setState({ overview: null, narrative: null, isLoading: true, error: null });

    try {
      // Build charging stops data from the trip plan
      const chargingStops = plan.chargingStops.map(stop => {
        const hasAlternatives = 'selected' in stop;
        const station = hasAlternatives ? stop.selected.station : stop.station;
        const arrivalBattery = hasAlternatives ? stop.batteryPercentAtArrival : stop.arrivalBatteryPercent;
        const departureBattery = hasAlternatives ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
        const chargeTime = hasAlternatives ? stop.selected.estimatedChargeTimeMin : stop.estimatedChargingTimeMin;
        const distanceKm = hasAlternatives ? stop.distanceAlongRouteKm : stop.distanceFromStartKm;

        return {
          stationName: station.name,
          address: station.address,
          distanceFromStartKm: distanceKm,
          chargingTimeMin: chargeTime,
          arrivalBattery,
          departureBattery,
        };
      });

      const response = await fetch('/api/route/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          startAddress: plan.startAddress,
          endAddress: plan.endAddress,
          totalDistanceKm: plan.totalDistanceKm,
          totalDurationMin: plan.totalDurationMin,
          chargingStops,
        }),
        signal,
      });

      if (signal.aborted) return;

      const data: NarrativeResponse = await response.json();

      if (signal.aborted) return;

      if (data.overview && data.narrative) {
        // Cache the result
        if (tripId) {
          setCachedNarrative(tripId, { overview: data.overview, narrative: data.narrative });
        }
        setState({
          overview: data.overview,
          narrative: data.narrative,
          isLoading: false,
          error: null,
        });
      } else {
        setState({
          overview: null,
          narrative: null,
          isLoading: false,
          error: data.error ?? 'Failed to generate narrative',
        });
      }
    } catch (err) {
      if (signal.aborted) return;
      setState({
        overview: null,
        narrative: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch narrative',
      });
    }
  }, []);

  useEffect(() => {
    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Reset if no trip plan
    if (!tripPlan) {
      lastTripIdRef.current = null;
      setState(INITIAL_STATE);
      return;
    }

    // Skip if same trip
    const currentTripId = tripPlan.tripId ?? null;
    if (currentTripId && currentTripId === lastTripIdRef.current) {
      return;
    }
    lastTripIdRef.current = currentTripId;

    const controller = new AbortController();
    abortRef.current = controller;

    fetchNarrative(tripPlan, controller.signal);

    return () => {
      controller.abort();
    };
  }, [tripPlan, fetchNarrative]);

  return state;
}
