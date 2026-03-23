import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  stationEvents,
  onStationHighlight,
  onStationClearHighlight,
  onStationAskEVi,
  emitStationHighlight,
  emitStationClearHighlight,
  emitStationAskEVi,
  type StationHighlightPayload,
  type StationAskEViPayload,
} from './station-events';

describe('station-events', () => {
  beforeEach(() => {
    // Remove all listeners between tests by replacing the internal EventTarget
    // We test the public API, so we just verify behavior in isolation
  });

  describe('stationEvents singleton', () => {
    it('exports a singleton instance', () => {
      expect(stationEvents).toBeDefined();
    });
  });

  describe('station:highlight', () => {
    it('emits and receives highlight events with typed payload', () => {
      const handler = vi.fn();
      const payload: StationHighlightPayload = {
        stationId: 'station-1',
        latitude: 10.762,
        longitude: 106.66,
      };

      const unsubscribe = onStationHighlight(handler);
      emitStationHighlight(payload);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(payload);

      unsubscribe();
    });

    it('does not fire after unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = onStationHighlight(handler);

      unsubscribe();
      emitStationHighlight({ stationId: 'x', latitude: 0, longitude: 0 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const payload: StationHighlightPayload = {
        stationId: 'station-2',
        latitude: 21.0285,
        longitude: 105.8542,
      };

      const unsub1 = onStationHighlight(handler1);
      const unsub2 = onStationHighlight(handler2);
      emitStationHighlight(payload);

      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);

      unsub1();
      unsub2();
    });

    it('unsubscribing one listener does not affect others', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = onStationHighlight(handler1);
      const unsub2 = onStationHighlight(handler2);

      unsub1();
      emitStationHighlight({ stationId: 'y', latitude: 0, longitude: 0 });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();

      unsub2();
    });
  });

  describe('station:clear-highlight', () => {
    it('emits and receives clear-highlight events', () => {
      const handler = vi.fn();

      const unsubscribe = onStationClearHighlight(handler);
      emitStationClearHighlight();

      expect(handler).toHaveBeenCalledOnce();

      unsubscribe();
    });

    it('does not fire after unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = onStationClearHighlight(handler);

      unsubscribe();
      emitStationClearHighlight();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('station:ask-evi', () => {
    it('emits and receives ask-evi events with typed payload', () => {
      const handler = vi.fn();
      const payload: StationAskEViPayload = {
        stationId: 'station-3',
        stationName: 'VinFast Charging Quận 1',
      };

      const unsubscribe = onStationAskEVi(handler);
      emitStationAskEVi(payload);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(payload);

      unsubscribe();
    });

    it('does not fire after unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = onStationAskEVi(handler);

      unsubscribe();
      emitStationAskEVi({ stationId: 'z', stationName: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('cross-event isolation', () => {
    it('highlight listener does not fire on ask-evi event', () => {
      const highlightHandler = vi.fn();
      const askHandler = vi.fn();

      const unsub1 = onStationHighlight(highlightHandler);
      const unsub2 = onStationAskEVi(askHandler);

      emitStationAskEVi({ stationId: 'a', stationName: 'Test' });

      expect(highlightHandler).not.toHaveBeenCalled();
      expect(askHandler).toHaveBeenCalledOnce();

      unsub1();
      unsub2();
    });

    it('ask-evi listener does not fire on highlight event', () => {
      const highlightHandler = vi.fn();
      const askHandler = vi.fn();

      const unsub1 = onStationHighlight(highlightHandler);
      const unsub2 = onStationAskEVi(askHandler);

      emitStationHighlight({ stationId: 'b', latitude: 0, longitude: 0 });

      expect(highlightHandler).toHaveBeenCalledOnce();
      expect(askHandler).not.toHaveBeenCalled();

      unsub1();
      unsub2();
    });
  });

  describe('idempotent unsubscribe', () => {
    it('calling unsubscribe multiple times does not throw', () => {
      const handler = vi.fn();
      const unsubscribe = onStationHighlight(handler);

      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
