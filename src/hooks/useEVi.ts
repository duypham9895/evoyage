'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage, EViParseResponse, NearbyStationInfo } from '@/lib/evi/types';

// ── State Machine ──
type EViState = 'idle' | 'processing' | 'complete' | 'follow_up' | 'error';

// ── User Location ──
interface UserLocation {
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
}

// ── Recent Trip (from localStorage) ──
interface RecentTrip {
  readonly start: string;
  readonly end: string;
  readonly vehicleName?: string | null;
}

// ── Hook Return Type ──
interface UseEViReturn {
  readonly state: EViState;
  readonly messages: readonly ChatMessage[];
  readonly lastResponse: EViParseResponse | null;
  readonly userLocation: UserLocation | null;
  readonly isFirstVisit: boolean;
  readonly recentTrips: readonly RecentTrip[];
  readonly followUpSuggestions: readonly string[];
  readonly isSuggestionsLoading: boolean;
  readonly sendMessage: (text: string) => Promise<void>;
  readonly reset: () => void;
}

// ── Constants ──
const FIRST_VISIT_KEY = 'evi-first-visit';
const FIRST_VISIT_DONE = 'done';
const RECENT_TRIPS_KEY = 'ev-recent-trips';
const MAX_HISTORY = 10;
const MAX_CLIENT_RETRIES = 2;
const CLIENT_RETRY_DELAY_MS = 1000;
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'EVoyage/1.0 (https://evoyagevn.vercel.app)';

// ── Helpers ──

function buildHistoryPayload(
  messages: readonly ChatMessage[],
): readonly { role: 'user' | 'assistant'; content: string }[] {
  return messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function deriveState(response: EViParseResponse): EViState {
  if (response.error) return 'error';
  if (response.isStationSearch) return 'follow_up';
  if (response.isComplete) return 'complete';
  return 'follow_up';
}

function extractAssistantContent(response: EViParseResponse): string {
  return response.followUpQuestion ?? response.displayMessage;
}

// ── Hook ──

export function useEVi(): UseEViReturn {
  const [state, setState] = useState<EViState>('idle');
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<EViParseResponse | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<readonly string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);

  // Track active suggestions request to avoid stale updates
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  const [isFirstVisit] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(FIRST_VISIT_KEY) !== FIRST_VISIT_DONE;
  });

  const [recentTrips] = useState<readonly RecentTrip[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_TRIPS_KEY) ?? '[]');
      if (!Array.isArray(saved)) return [];
      return saved
        .filter(
          (t: unknown): t is RecentTrip =>
            typeof t === 'object' &&
            t !== null &&
            typeof (t as Record<string, unknown>).start === 'string' &&
            typeof (t as Record<string, unknown>).end === 'string',
        )
        .slice(0, 3);
    } catch {
      return [];
    }
  });

  // Ref to avoid stale closures in sendMessage
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const lastResponseRef = useRef(lastResponse);
  lastResponseRef.current = lastResponse;

  // ── Geolocation (mount only) ──
  useEffect(() => {
    let cancelled = false;

    async function fetchLocation() {
      if (!navigator.geolocation) return;

      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'geolocation',
        });
        if (permissionStatus.state === 'denied') return;
        // 'granted' → proceed silently; 'prompt' → browser will ask user
      } catch {
        // permissions API not supported — still try geolocation
      }

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10_000,
              maximumAge: 300_000, // 5 min cache
            });
          },
        );

        if (cancelled) return;

        const { latitude: lat, longitude: lng } = position.coords;

        const url = `${NOMINATIM_BASE}?lat=${lat}&lon=${lng}&format=json&accept-language=vi&zoom=16`;
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
        });

        if (!res.ok || cancelled) return;

        const data = await res.json();
        const address: string = data.display_name ?? '';

        if (!cancelled) {
          setUserLocation({ lat, lng, address });
        }
      } catch {
        // geolocation or reverse-geocode failed — leave null
      }
    }

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── fetchSuggestions (non-blocking, fire-and-forget) ──
  const fetchSuggestions = useCallback((
    allMessages: readonly ChatMessage[],
    response: EViParseResponse,
  ): void => {
    // Cancel any in-flight suggestions request
    suggestionsAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    setIsSuggestionsLoading(true);
    setFollowUpSuggestions([]);

    const tripContext = response.tripParams
      ? {
          start: response.tripParams.start,
          end: response.tripParams.end,
          vehicleName: response.tripParams.vehicleName,
          currentBattery: response.tripParams.currentBattery,
          isComplete: response.isComplete,
        }
      : null;

    const payload = {
      messages: allMessages.slice(-MAX_HISTORY).map(m => ({
        role: m.role,
        content: m.content,
      })),
      tripContext,
    };

    fetch('/api/evi/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) return { suggestions: [] };
        return res.json();
      })
      .then(data => {
        if (!controller.signal.aborted && Array.isArray(data.suggestions)) {
          setFollowUpSuggestions(data.suggestions);
        }
      })
      .catch(() => {
        // Aborted or network error — silently ignore
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSuggestionsLoading(false);
        }
      });
  }, []);

  // ── sendMessage ──
  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messagesRef.current, userMsg];

    // Clear suggestions when user sends a new message
    setFollowUpSuggestions([]);
    setIsSuggestionsLoading(false);
    suggestionsAbortRef.current?.abort();

    setMessages(updatedMessages);
    setState('processing');

    const locationPayload = userLocationRef.current
      ? { lat: userLocationRef.current.lat, lng: userLocationRef.current.lng }
      : null;

    // Build accumulated params from the last successful response
    const prevParams = lastResponseRef.current?.tripParams;
    const accumulatedParams = prevParams
      ? {
          start: prevParams.start,
          end: prevParams.end,
          vehicleBrand: prevParams.vehicleData?.brand ?? null,
          vehicleModel: prevParams.vehicleData
            ? `${prevParams.vehicleData.model}${prevParams.vehicleData.variant ? ` ${prevParams.vehicleData.variant}` : ''}`
            : null,
          currentBattery: prevParams.currentBattery,
        }
      : null;

    const requestBody = JSON.stringify({
      message: text,
      history: buildHistoryPayload(messagesRef.current),
      userLocation: locationPayload,
      previousVehicleId: lastResponseRef.current?.tripParams?.vehicleId ?? null,
      accumulatedParams,
    });

    // Auto-retry on transient failures (503, network errors)
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt <= MAX_CLIENT_RETRIES; attempt++) {
      try {
        lastRes = await fetch('/api/evi/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        // Success or non-retryable error (400, 429) — stop retrying
        if (lastRes.ok || (lastRes.status !== 503 && lastRes.status !== 502)) {
          break;
        }
      } catch {
        // Network error — retry
        lastRes = null;
      }

      // Wait before retrying
      if (attempt < MAX_CLIENT_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, CLIENT_RETRY_DELAY_MS * (attempt + 1)));
      }
    }

    try {
      if (!lastRes) {
        throw new Error('Network error after retries');
      }

      if (!lastRes.ok) {
        let friendlyMessage = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.';
        try {
          const errorJson = await lastRes.json();
          if (errorJson.displayMessage) {
            friendlyMessage = errorJson.displayMessage;
          }
        } catch {
          // Response wasn't JSON — use default message
        }
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: friendlyMessage,
        };
        setMessages([...updatedMessages, errorMsg]);
        setState('error');
        return;
      }

      let response: EViParseResponse = await lastRes.json();

      // Handle station search — fetch nearby stations from dedicated API
      if (response.isStationSearch && userLocationRef.current) {
        try {
          const stationRes = await fetch('/api/stations/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: userLocationRef.current.lat,
              longitude: userLocationRef.current.lng,
              radiusKm: 5,
              vehicleId: lastResponseRef.current?.tripParams?.vehicleId ?? null,
              currentBattery: lastResponseRef.current?.tripParams?.currentBattery ?? null,
            }),
          });

          if (stationRes.ok) {
            const stationData = await stationRes.json();
            const stations: readonly NearbyStationInfo[] = (stationData.stations ?? []).map(
              (s: Record<string, unknown>) => ({
                name: (s.station as Record<string, unknown>)?.name ?? '',
                distanceKm: s.distanceKm as number,
                maxPowerKw: (s.station as Record<string, unknown>)?.maxPowerKw ?? 0,
                connectorTypes: (s.station as Record<string, unknown>)?.connectorTypes ?? [],
                provider: (s.station as Record<string, unknown>)?.provider ?? '',
                isCompatible: s.isCompatible as boolean,
                estimatedChargeTimeMin: (s.estimatedChargeTimeMin as number) ?? null,
                chargingStatus: (s.station as Record<string, unknown>)?.chargingStatus ?? null,
                latitude: (s.station as Record<string, unknown>)?.latitude as number,
                longitude: (s.station as Record<string, unknown>)?.longitude as number,
              }),
            );
            response = { ...response, nearbyStations: stations };
          }
        } catch {
          // Station fetch failed — show response without station data
        }
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: extractAssistantContent(response),
      };

      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      setLastResponse(response);

      const nextState = deriveState(response);
      setState(nextState);

      if (nextState === 'complete') {
        try {
          localStorage.setItem(FIRST_VISIT_KEY, FIRST_VISIT_DONE);
        } catch {
          // localStorage unavailable — ignore
        }
      }

      // Fetch AI-powered follow-up suggestions for follow_up state (not for station search)
      if (nextState === 'follow_up' && !response.isStationSearch) {
        fetchSuggestions(finalMessages, response);
      }
    } catch {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Không thể kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.',
      };
      setMessages([...updatedMessages, errorMsg]);
      setState('error');
    }
  }, [fetchSuggestions]);

  // ── reset ──
  const reset = useCallback((): void => {
    setMessages([]);
    setState('idle');
    setLastResponse(null);
    setFollowUpSuggestions([]);
    setIsSuggestionsLoading(false);
    suggestionsAbortRef.current?.abort();
  }, []);

  return {
    state,
    messages,
    lastResponse,
    userLocation,
    isFirstVisit,
    recentTrips,
    followUpSuggestions,
    isSuggestionsLoading,
    sendMessage,
    reset,
  };
}
