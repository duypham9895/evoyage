/**
 * Trip notebook — localStorage-backed store of saved trip plans.
 *
 * v1 is browser-local: every device keeps its own list. Server sync is a
 * Phase 5b decision once we see actual demand. See spec
 * `docs/specs/2026-05-03-phase-5-trip-notebook-design.md`.
 *
 * Key responsibilities:
 *  - Persist saved trips across browser sessions
 *  - Dedup save() within a 5-min window for the same (start, end, vehicle,
 *    departAt, waypoints) tuple
 *  - Enforce a 50-entry cap, pruning the oldest unpinned entries first
 *  - Surface graceful no-ops when localStorage is unavailable (Incognito,
 *    SSR, blocked-by-policy) so callers don't have to guard
 *
 * Storage key is versioned (`evoyage-notebook-v1`) so a future schema
 * change can ship a v2 store without crashing legacy clients.
 */
import type { CustomVehicleInput } from '@/types';

const STORAGE_KEY = 'evoyage-notebook-v1';
const MAX_ENTRIES = 50;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export interface SavedTripWaypoint {
  readonly lat: number;
  readonly lng: number;
  readonly name?: string;
}

/** Caller-supplied fields. Identity + timestamps + pin are managed by the store. */
export interface SavedTripInput {
  readonly start: string;
  readonly end: string;
  readonly startCoords?: { lat: number; lng: number };
  readonly endCoords?: { lat: number; lng: number };
  readonly waypoints: readonly SavedTripWaypoint[];
  readonly isLoopTrip: boolean;
  readonly vehicleId: string | null;
  readonly customVehicle: CustomVehicleInput | null;
  readonly currentBattery: number;
  readonly minArrival: number;
  readonly rangeSafetyFactor: number;
  readonly departAt: string | null;
}

export interface SavedTrip extends SavedTripInput {
  readonly id: string;
  readonly savedAt: string;
  readonly lastViewedAt: string;
  readonly pinned: boolean;
}

export interface NotebookStore {
  list(): readonly SavedTrip[];
  save(trip: SavedTripInput): SavedTrip;
  pin(id: string, pinned: boolean): void;
  touch(id: string): void;
  remove(id: string): void;
  clear(): void;
}

// ── Internal helpers ──

function safeParse(raw: string | null): SavedTrip[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlausibleSavedTrip);
  } catch {
    return [];
  }
}

function isPlausibleSavedTrip(value: unknown): value is SavedTrip {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.savedAt === 'string' &&
    typeof v.start === 'string' &&
    typeof v.end === 'string'
  );
}

function isSameTuple(a: SavedTripInput, b: SavedTrip): boolean {
  if (a.start !== b.start) return false;
  if (a.end !== b.end) return false;
  if (a.vehicleId !== b.vehicleId) return false;
  if (a.departAt !== b.departAt) return false;
  if (a.waypoints.length !== b.waypoints.length) return false;
  for (let i = 0; i < a.waypoints.length; i++) {
    const wpA = a.waypoints[i]!;
    const wpB = b.waypoints[i]!;
    if (wpA.lat !== wpB.lat || wpA.lng !== wpB.lng) return false;
  }
  return true;
}

/** Cryptographically-strong-enough id without relying on `crypto.randomUUID` (older browsers). */
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sort: pinned first, then by lastViewedAt desc */
function sortEntries(entries: readonly SavedTrip[]): SavedTrip[] {
  return [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastViewedAt.localeCompare(a.lastViewedAt);
  });
}

/** Cap to MAX_ENTRIES, pruning oldest unpinned. */
function applyCap(entries: readonly SavedTrip[]): SavedTrip[] {
  if (entries.length <= MAX_ENTRIES) return [...entries];
  const sorted = sortEntries(entries);
  const pinned = sorted.filter((t) => t.pinned);
  const unpinned = sorted.filter((t) => !t.pinned);
  const room = Math.max(0, MAX_ENTRIES - pinned.length);
  return [...pinned, ...unpinned.slice(0, room)];
}

// ── Factory ──

export function createNotebookStore(storage?: Storage): NotebookStore {
  // Use injected storage (test affordance) or window.localStorage when available;
  // otherwise an in-memory fallback so SSR / Incognito don't crash callers.
  const backing: Storage =
    storage ??
    (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
      ? window.localStorage
      : memoryShim());

  function read(): SavedTrip[] {
    try {
      return safeParse(backing.getItem(STORAGE_KEY));
    } catch {
      return [];
    }
  }

  function write(entries: SavedTrip[]): void {
    try {
      backing.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded or storage blocked — try pruning oldest 10 and retry once
      try {
        const pruned = sortEntries(entries).slice(0, Math.max(1, entries.length - 10));
        backing.setItem(STORAGE_KEY, JSON.stringify(pruned));
      } catch {
        // Truly cannot persist; in-memory state is whatever it is — accept silent failure
      }
    }
  }

  return {
    list() {
      return sortEntries(read());
    },
    save(trip) {
      const now = new Date().toISOString();
      const entries = read();

      // Dedup window: same tuple within 5 min returns the existing entry
      const recent = entries.find(
        (e) =>
          isSameTuple(trip, e) &&
          Date.now() - new Date(e.savedAt).getTime() <= DEDUP_WINDOW_MS,
      );
      if (recent) return recent;

      const created: SavedTrip = {
        ...trip,
        id: makeId(),
        savedAt: now,
        lastViewedAt: now,
        pinned: false,
      };
      write(applyCap([created, ...entries]));
      return created;
    },
    pin(id, pinned) {
      const entries = read();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;
      entries[idx] = { ...entries[idx]!, pinned };
      write(entries);
    },
    touch(id) {
      const entries = read();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;
      entries[idx] = { ...entries[idx]!, lastViewedAt: new Date().toISOString() };
      write(entries);
    },
    remove(id) {
      const entries = read().filter((e) => e.id !== id);
      write(entries);
    },
    clear() {
      try {
        backing.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

function memoryShim(): Storage {
  let data: string | null = null;
  return {
    get length() { return data === null ? 0 : 1; },
    clear() { data = null; },
    getItem() { return data; },
    key() { return STORAGE_KEY; },
    removeItem() { data = null; },
    setItem(_k, v) { data = v; },
  };
}
