'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const NEXT_STATUSES: Record<string, readonly string[]> = {
  NEW: ['IN_REVIEW', 'RESOLVED', 'CLOSED'],
  IN_REVIEW: ['RESOLVED', 'CLOSED', 'NEW'],
  RESOLVED: ['CLOSED', 'IN_REVIEW'],
  CLOSED: ['NEW'],
};

interface Props {
  readonly id: string;
  readonly currentStatus: string;
}

export default function StatusActions({ id, currentStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const options = NEXT_STATUSES[currentStatus] ?? [];

  function updateStatus(next: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/feedback/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error ?? `Update failed (${res.status})`);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
      }
    });
  }

  if (options.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold mb-2">Move to…</h2>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <button
            key={s}
            type="button"
            disabled={isPending}
            onClick={() => updateStatus(s)}
            className="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
    </section>
  );
}
