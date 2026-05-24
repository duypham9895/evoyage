import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CATEGORY_LABELS_VI } from '@/lib/feedback/constants';
import type { FeedbackCategory } from '@/lib/feedback/constants';
import StatusActions from './StatusActions';

export const dynamic = 'force-dynamic';

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function field(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words">{String(value)}</dd>
    </div>
  );
}

export default async function AdminFeedbackDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await prisma.feedback.findUnique({ where: { id } });
  if (!row) notFound();

  const category = CATEGORY_LABELS_VI[row.category as FeedbackCategory] ?? row.category;

  return (
    <div className="space-y-5">
      <nav className="text-sm text-[var(--color-muted)]">
        <Link href="/admin/feedback" className="hover:underline">
          ← Back to inbox
        </Link>
      </nav>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{category}</h1>
        <div className="text-xs text-[var(--color-muted)]">
          {row.id} · created {formatDate(row.createdAt)} · status {row.status}
          {row.resolvedAt ? ` · resolved ${formatDate(row.resolvedAt)}` : ''}
        </div>
      </header>

      <StatusActions id={row.id} currentStatus={row.status} />

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold mb-2">Message</h2>
        <p className="whitespace-pre-wrap text-sm">{row.description}</p>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-semibold mb-3">Metadata</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {field('Name', row.name)}
          {field('Email', row.email)}
          {field('Phone', row.phone)}
          {field('Steps to reproduce', row.stepsToReproduce)}
          {field('Use case', row.useCase)}
          {field('Correct info', row.correctInfo)}
          {field('Rating', row.rating)}
          {field('Station ID', row.stationId)}
          {field('Station name', row.stationName)}
          {field('Proposed latitude', row.proposedLatitude)}
          {field('Proposed longitude', row.proposedLongitude)}
          {field('Proposed provider', row.proposedProvider)}
          {field('Image URL', row.imageUrl)}
          {field('Page URL', row.pageUrl)}
          {field('Route params', row.routeParams)}
          {field('Viewport', row.viewport)}
          {field('User agent', row.userAgent)}
          {field('IP hash (truncated)', row.ipHash?.slice(0, 12) ?? null)}
          {field('Email sent', row.emailSent ? 'yes' : 'no')}
        </dl>
      </section>
    </div>
  );
}
