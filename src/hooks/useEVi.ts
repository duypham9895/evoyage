'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage, EViParseResponse } from '@/lib/evi/types';

// ── State Machine ──
type EViState = 'idle' | 'processing' | 'complete' | 'follow_up' | 'error';

// ── User Location ──
interface UserLocation {
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
}

// ── Hook Return Type ──
interface UseEViReturn {
  readonly state: EViState;
  readonly messages: readonly ChatMessage[];
  readonly lastResponse: EViParseResponse | null;
  readonly userLocation: UserLocation | null;
  readonly isFirstVisit: boolean;
  readonly sendMessage: (text: string) => Promise<void>;
  readonly reset: () => void;
}

// ── Constants ──
const FIRST_VISIT_KEY = 'evi-first-visit';
const FIRST_VISIT_DONE = 'done';
const MAX_HISTORY = 4;
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

  const [isFirstVisit] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(FIRST_VISIT_KEY) !== FIRST_VISIT_DONE;
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

  // ── sendMessage ──
  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messagesRef.current, userMsg];

    setMessages(updatedMessages);
    setState('processing');

    const locationPayload = userLocationRef.current
      ? { lat: userLocationRef.current.lat, lng: userLocationRef.current.lng }
      : null;

    try {
      const res = await fetch('/api/evi/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: buildHistoryPayload(messagesRef.current),
          userLocation: locationPayload,
          previousVehicleId: lastResponseRef.current?.tripParams?.vehicleId ?? null,
        }),
      });

      if (!res.ok) {
        let friendlyMessage = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.';
        try {
          const errorJson = await res.json();
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

      const response: EViParseResponse = await res.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: extractAssistantContent(response),
      };

      setMessages([...updatedMessages, assistantMsg]);
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
    } catch {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Không thể kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.',
      };
      setMessages([...updatedMessages, errorMsg]);
      setState('error');
    }
  }, []);

  // ── reset ──
  const reset = useCallback((): void => {
    setMessages([]);
    setState('idle');
    setLastResponse(null);
  }, []);

  return {
    state,
    messages,
    lastResponse,
    userLocation,
    isFirstVisit,
    sendMessage,
    reset,
  };
}
