// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createNotebookStore, type NotebookStore, type SavedTripInput } from './notebook-store';

const SAMPLE: SavedTripInput = {
  start: 'Quận 1, TP.HCM',
  end: 'Đà Lạt',
  startCoords: { lat: 10.78, lng: 106.7 },
  endCoords: { lat: 11.94, lng: 108.45 },
  waypoints: [],
  isLoopTrip: false,
  vehicleId: 'vf-8-plus',
  customVehicle: null,
  currentBattery: 80,
  minArrival: 15,
  rangeSafetyFactor: 0.8,
  departAt: null,
};

describe('NotebookStore', () => {
  let store: NotebookStore;

  beforeEach(() => {
    localStorage.clear();
    store = createNotebookStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('save + list', () => {
    it('saves a new trip and returns it via list()', () => {
      const saved = store.save(SAMPLE);
      expect(saved.id).toMatch(/.+/);
      expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(saved.pinned).toBe(false);
      expect(store.list()).toHaveLength(1);
    });

    it('persists across new store instances (localStorage backed)', () => {
      store.save(SAMPLE);
      const fresh = createNotebookStore();
      expect(fresh.list()).toHaveLength(1);
    });

    it('returns most-recent first by default (lastViewedAt desc)', () => {
      store.save({ ...SAMPLE, end: 'Vũng Tàu' });
      store.save({ ...SAMPLE, end: 'Nha Trang' });
      const all = store.list();
      expect(all[0]?.end).toBe('Nha Trang');
      expect(all[1]?.end).toBe('Vũng Tàu');
    });

    it('places pinned trips above unpinned regardless of recency', () => {
      const old = store.save({ ...SAMPLE, end: 'Vũng Tàu' });
      store.save({ ...SAMPLE, end: 'Nha Trang' });
      store.pin(old.id, true);
      const all = store.list();
      expect(all[0]?.end).toBe('Vũng Tàu'); // pinned, even though older
      expect(all[1]?.end).toBe('Nha Trang');
    });
  });

  describe('dedup window', () => {
    it('returns the existing entry when same tuple saved within 5 min', () => {
      const first = store.save(SAMPLE);
      const second = store.save(SAMPLE);
      expect(second.id).toBe(first.id);
      expect(store.list()).toHaveLength(1);
    });

    it('treats different waypoints as a new entry', () => {
      store.save(SAMPLE);
      store.save({ ...SAMPLE, waypoints: [{ lat: 11, lng: 107 }] });
      expect(store.list()).toHaveLength(2);
    });

    it('treats different departAt as a new entry', () => {
      store.save(SAMPLE);
      store.save({ ...SAMPLE, departAt: '2026-05-10T08:00:00Z' });
      expect(store.list()).toHaveLength(2);
    });

    it('saves a new entry when same tuple is older than 5 min', () => {
      vi.useFakeTimers();
      store.save(SAMPLE);
      vi.setSystemTime(Date.now() + 6 * 60_000);
      const refreshed = createNotebookStore(); // simulate later session
      const second = refreshed.save(SAMPLE);
      expect(refreshed.list()).toHaveLength(2);
      expect(second.id).not.toBe(refreshed.list()[1]?.id);
      vi.useRealTimers();
    });
  });

  describe('pin / touch / remove / clear', () => {
    it('pin toggles the boolean', () => {
      const t = store.save(SAMPLE);
      store.pin(t.id, true);
      expect(store.list()[0]?.pinned).toBe(true);
      store.pin(t.id, false);
      expect(store.list()[0]?.pinned).toBe(false);
    });

    it('touch bumps lastViewedAt without changing savedAt', async () => {
      const t = store.save(SAMPLE);
      const originalSavedAt = t.savedAt;
      const originalViewedAt = t.lastViewedAt;
      // Force a measurable delta
      await new Promise((r) => setTimeout(r, 5));
      store.touch(t.id);
      const after = store.list()[0]!;
      expect(after.savedAt).toBe(originalSavedAt);
      expect(after.lastViewedAt).not.toBe(originalViewedAt);
    });

    it('remove deletes the entry', () => {
      const t = store.save(SAMPLE);
      store.remove(t.id);
      expect(store.list()).toHaveLength(0);
    });

    it('clear empties everything', () => {
      store.save(SAMPLE);
      store.save({ ...SAMPLE, end: 'Đồng Nai' });
      store.clear();
      expect(store.list()).toHaveLength(0);
    });

    it('pin / touch / remove on missing id is a no-op (no throw)', () => {
      expect(() => store.pin('nonexistent', true)).not.toThrow();
      expect(() => store.touch('nonexistent')).not.toThrow();
      expect(() => store.remove('nonexistent')).not.toThrow();
    });
  });

  describe('entry cap', () => {
    it('keeps only the most recent 50 entries', () => {
      for (let i = 0; i < 55; i++) {
        store.save({ ...SAMPLE, end: `Dest ${i}` });
      }
      const all = store.list();
      expect(all).toHaveLength(50);
      // Oldest 5 should be gone
      const ends = all.map((t) => t.end);
      expect(ends).not.toContain('Dest 0');
      expect(ends).not.toContain('Dest 4');
      expect(ends).toContain('Dest 5');
      expect(ends).toContain('Dest 54');
    });

    it('does NOT prune pinned entries even when over the cap', () => {
      const pinned = store.save({ ...SAMPLE, end: 'Pin-me' });
      store.pin(pinned.id, true);
      for (let i = 0; i < 55; i++) {
        store.save({ ...SAMPLE, end: `Dest ${i}` });
      }
      const all = store.list();
      const ends = all.map((t) => t.end);
      expect(ends).toContain('Pin-me');
    });
  });

  describe('storage failures', () => {
    it('returns empty list when storage is unavailable', () => {
      const broken: Storage = {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
        clear: () => { /* noop */ },
        key: () => null,
        length: 0,
      };
      const incognito = createNotebookStore(broken);
      expect(incognito.list()).toEqual([]);
    });

    it('save in unavailable storage returns the entry (in-memory only) without throwing', () => {
      const broken: Storage = {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
        clear: () => { /* noop */ },
        key: () => null,
        length: 0,
      };
      const incognito = createNotebookStore(broken);
      const saved = incognito.save(SAMPLE);
      expect(saved.id).toMatch(/.+/);
    });
  });

  describe('storage key versioning', () => {
    it('uses the v1 key', () => {
      store.save(SAMPLE);
      expect(localStorage.getItem('evoyage-notebook-v1')).toBeTruthy();
    });

    it('ignores entries written under a different key version', () => {
      localStorage.setItem('evoyage-notebook-v0', JSON.stringify([{ broken: true }]));
      const fresh = createNotebookStore();
      expect(fresh.list()).toEqual([]);
    });
  });
});
