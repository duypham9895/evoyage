'use client';

import type { ReactNode } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';

interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Rendered as the dialog's accessible name (an `<h2>`). */
  readonly title: ReactNode;
  readonly children: ReactNode;
}

/**
 * Minimal modal dialog wrapper around Base UI's Dialog primitive
 * (design-system-research-2026-11-01.md §D7). Portals to `<body>`, traps
 * focus, closes on Escape, and restores focus to whatever was focused
 * before it opened — all owned by Base UI rather than hand-rolled per modal.
 *
 * Styled with existing DESIGN.md tokens: surface background, `rounded-xl`,
 * and the same `bg-black/60` scrim every hand-rolled modal already used.
 */
export default function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <BaseDialog.Popup
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
        >
          <div className="bg-[var(--color-surface)] rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <BaseDialog.Title className="text-lg font-bold font-[family-name:var(--font-heading)] text-[var(--color-accent)] mb-4">
              {title}
            </BaseDialog.Title>
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
