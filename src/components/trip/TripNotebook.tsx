'use client';

/**
 * TripNotebook list view (Phase 5 Day 3).
 *
 * Wraps the notebook-store with a React-friendly UI. Owns local "version"
 * state that bumps on every store mutation so the list re-renders without
 * coupling the store layer to React state.
 *
 * Pin / delete actions update the store and refresh local state. Re-plan
 * bubbles up — TripNotebook doesn't know how to load a saved trip into the
 * page; that's the parent's job.
 */
import { useState, useCallback } from 'react';
import TripNotebookEntry, { type TripNotebookEntryI18n } from './TripNotebookEntry';
import type { NotebookStore, SavedTrip } from '@/lib/trip/notebook-store';

export interface TripNotebookI18n extends TripNotebookEntryI18n {
  readonly heading: string;
  readonly empty: string;
}

interface TripNotebookProps {
  readonly store: NotebookStore;
  readonly resolveVehicleName: (vehicleId: string | null) => string | null;
  readonly onReplan: (trip: SavedTrip) => void;
  readonly i18n: TripNotebookI18n;
}

export default function TripNotebook({
  store,
  resolveVehicleName,
  onReplan,
  i18n,
}: TripNotebookProps) {
  // Bump on every store mutation to force re-read; cheap because list() is
  // a localStorage parse + sort over ≤ 50 entries.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const entries = store.list();
  // Reference `version` so React knows this is a dependency of the render
  // even though we re-read from store on every render.
  void version;

  const handlePin = useCallback(
    (id: string, pinned: boolean) => {
      store.pin(id, pinned);
      bump();
    },
    [store, bump],
  );

  const handleDelete = useCallback(
    (id: string) => {
      store.remove(id);
      bump();
    },
    [store, bump],
  );

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-[var(--color-muted)] text-center">{i18n.empty}</div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {i18n.heading}
      </h2>
      <ol role="list" className="space-y-2">
        {entries.map((trip) => (
          <li key={trip.id}>
            <TripNotebookEntry
              trip={trip}
              vehicleName={resolveVehicleName(trip.vehicleId)}
              onReplan={onReplan}
              onPin={handlePin}
              onDelete={handleDelete}
              i18n={i18n}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
