'use client';

/**
 * Phase 2 — Departure time picker.
 *
 * Lets the user choose "khi nào đi" so the trip plan reflects predicted
 * traffic at that moment instead of free-flow conditions. Default is
 * "now" (null value) — most users plan for immediate departure.
 *
 * Why a native datetime-local input:
 * - First-class OS picker on iOS / Android (no custom calendar to maintain)
 * - Honors device locale + timezone automatically
 * - Accessible by default (keyboard, screen reader)
 *
 * Per project DESIGN.md "Less Icons, More Humanity": no decorative icons,
 * no calendar/clock glyphs — the OS picker speaks for itself.
 *
 * Min: now. Max: 7 days from now (Mapbox driving-traffic predictive horizon).
 */

interface DepartureTimePickerI18n {
  readonly label: string;
  readonly resetButton: string;
  readonly helperFuture: string;
}

interface DepartureTimePickerProps {
  /** ISO 8601 string when a future departure is set; null for "now". */
  readonly value: string | null;
  readonly onChange: (next: string | null) => void;
  readonly i18n: DepartureTimePickerI18n;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Convert a Date to the local "YYYY-MM-DDTHH:mm" format datetime-local expects. */
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DepartureTimePicker({
  value,
  onChange,
  i18n,
}: DepartureTimePickerProps) {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + SEVEN_DAYS_MS);

  const inputValue = value ? toLocalInputValue(new Date(value)) : '';

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (!raw) {
      onChange(null);
      return;
    }
    // datetime-local emits "YYYY-MM-DDTHH:mm" interpreted as local time
    onChange(new Date(raw).toISOString());
  }

  function handleReset() {
    onChange(null);
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm text-[var(--color-foreground)]">
        {i18n.label}
        <input
          type="datetime-local"
          value={inputValue}
          min={toLocalInputValue(now)}
          max={toLocalInputValue(sevenDaysFromNow)}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-2 text-sm font-[family-name:var(--font-mono)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </label>

      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>{i18n.helperFuture}</span>
        {value !== null && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[var(--color-accent)] hover:underline focus:outline-none focus:underline"
          >
            {i18n.resetButton}
          </button>
        )}
      </div>
    </div>
  );
}
