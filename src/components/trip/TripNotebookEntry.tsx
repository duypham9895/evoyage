'use client';

/**
 * Single saved-trip row inside the TripNotebook view (Phase 5 Day 2).
 *
 * Pure presentational: parent supplies the SavedTrip + a pre-resolved
 * vehicle name + i18n strings + callback handlers. Tests don't need a
 * locale provider; the parent owns translation.
 *
 * Per project DESIGN.md "Less Icons, More Humanity": no decorative
 * icons. Text labels for all three actions (Mở lại / Ghim / Xoá).
 */
import { extractCityName } from '@/lib/trip/extract-city';
import type { SavedTrip } from '@/lib/trip/notebook-store';

export interface TripNotebookEntryI18n {
  readonly replan: string;
  readonly pin: string;
  readonly unpin: string;
  readonly remove: string;
  readonly vehicleMissing: string;
  readonly savedAgo: string; // contains {{when}} placeholder
  readonly formatRelative: (iso: string) => string;
}

interface TripNotebookEntryProps {
  readonly trip: SavedTrip;
  readonly vehicleName: string | null;
  readonly onReplan: (trip: SavedTrip) => void;
  readonly onPin: (id: string, pinned: boolean) => void;
  readonly onDelete: (id: string) => void;
  readonly i18n: TripNotebookEntryI18n;
}

export default function TripNotebookEntry({
  trip,
  vehicleName,
  onReplan,
  onPin,
  onDelete,
  i18n,
}: TripNotebookEntryProps) {
  const startCity = extractCityName(trip.start);
  const endCity = extractCityName(trip.end);
  const relative = i18n.formatRelative(trip.savedAt);
  const savedLabel = i18n.savedAgo.replace('{{when}}', relative);

  return (
    <article
      data-pinned={trip.pinned ? 'true' : 'false'}
      className={`p-3 rounded-lg border ${
        trip.pinned
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
          : 'border-[var(--color-surface-hover)] bg-[var(--color-surface)]'
      } space-y-2`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-foreground)] truncate">
          {startCity} → {endCity}
        </h3>
        <span className="text-[10px] text-[var(--color-muted)] shrink-0">{savedLabel}</span>
      </div>

      <div className="text-xs text-[var(--color-muted)]">
        {vehicleName ?? i18n.vehicleMissing}
      </div>

      <div className="flex items-center gap-3 text-xs pt-1">
        <button
          type="button"
          onClick={() => onReplan(trip)}
          className="text-[var(--color-accent)] hover:underline font-semibold"
        >
          {i18n.replan}
        </button>
        <button
          type="button"
          onClick={() => onPin(trip.id, !trip.pinned)}
          className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
        >
          {trip.pinned ? i18n.unpin : i18n.pin}
        </button>
        <button
          type="button"
          onClick={() => onDelete(trip.id)}
          className="text-[var(--color-muted)] hover:text-[var(--color-danger)]"
        >
          {i18n.remove}
        </button>
      </div>
    </article>
  );
}
