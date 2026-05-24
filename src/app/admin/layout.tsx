import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Admin — eVoyage',
  // Belt-and-braces — middleware already returns 401 + X-Robots-Tag: noindex
  // on unauth, but pages must also opt out of indexing for the rare path
  // where a crawler somehow reaches a 200.
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link href="/admin/feedback" className="font-semibold">
            eVoyage Admin
          </Link>
          <span className="text-xs text-[var(--color-muted)]">
            Internal — do not share this URL
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
