'use client';

// ── Station Event Payloads ──

export interface StationHighlightPayload {
  readonly stationId: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface StationAskEViPayload {
  readonly stationId: string;
  readonly stationName: string;
}

// ── Event Names ──

const HIGHLIGHT = 'station:highlight' as const;
const CLEAR_HIGHLIGHT = 'station:clear-highlight' as const;
const ASK_EVI = 'station:ask-evi' as const;

// ── Typed Event Emitter ──

type UnsubscribeFn = () => void;

class StationEventBus {
  private readonly target = new EventTarget();

  on<T>(eventName: string, handler: (payload: T) => void): UnsubscribeFn {
    const listener = (e: Event) => {
      handler((e as CustomEvent<T>).detail);
    };
    this.target.addEventListener(eventName, listener);

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.target.removeEventListener(eventName, listener);
    };
  }

  emit<T>(eventName: string, payload: T): void {
    this.target.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
  }
}

// ── Singleton Instance ──

export const stationEvents = new StationEventBus();

// ── Convenience Functions ──

export function onStationHighlight(
  handler: (payload: StationHighlightPayload) => void,
): UnsubscribeFn {
  return stationEvents.on<StationHighlightPayload>(HIGHLIGHT, handler);
}

export function emitStationHighlight(payload: StationHighlightPayload): void {
  stationEvents.emit(HIGHLIGHT, payload);
}

export function onStationClearHighlight(handler: () => void): UnsubscribeFn {
  return stationEvents.on<undefined>(CLEAR_HIGHLIGHT, () => handler());
}

export function emitStationClearHighlight(): void {
  stationEvents.emit(CLEAR_HIGHLIGHT, undefined);
}

export function onStationAskEVi(
  handler: (payload: StationAskEViPayload) => void,
): UnsubscribeFn {
  return stationEvents.on<StationAskEViPayload>(ASK_EVI, handler);
}

export function emitStationAskEVi(payload: StationAskEViPayload): void {
  stationEvents.emit(ASK_EVI, payload);
}
