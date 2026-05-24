import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { CATEGORY_LABELS_VI } from '@/lib/feedback/constants';
import type { FeedbackCategory } from '@/lib/feedback/constants';

export const dynamic = 'force-dynamic';

type StatusFilter = 'NEW' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED' | 'ALL';

const STATUS_FILTERS: readonly StatusFilter[] = ['NEW', 'IN_REVIEW', 'RESOLVED', 'CLOSED', 'ALL'];
const PAGE_SIZE = 50;

function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

function formatDate(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

export default async function AdminFeedbackList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const requested = (params.status ?? 'NEW').toUpperCase();
  const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(requested)
    ? (requested as StatusFilter)
    : 'NEW';

  const where = status === 'ALL' ? {} : { status };
  const [rows, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        createdAt: true,
        email: true,
        stationName: true,
      },
    }),
    prisma.feedback.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Feedback inbox</h1>
        <div className="text-xs text-[var(--color-muted)]">
          Showing {rows.length} of {total} {status === 'ALL' ? '' : `${status} `}rows
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/admin/feedback?status=${s}`}
            className={
              'px-3 py-1 rounded-md border ' +
              (s === status
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)]'
                : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]')
            }
          >
            {s}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-[var(--color-muted)] text-sm">
          No feedback rows match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 align-top whitespace-nowrap text-[var(--color-muted)] text-xs">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {CATEGORY_LABELS_VI[row.category as FeedbackCategory] ?? row.category}
                    {row.stationName ? (
                      <div className="text-xs text-[var(--color-muted)]">{row.stationName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top max-w-md">
                    {excerpt(row.description, 140)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-block px-2 py-0.5 rounded text-xs border border-[var(--color-border)]">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-[var(--color-muted)]">
                    {row.email ?? '—'}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/admin/feedback/${row.id}`}
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
