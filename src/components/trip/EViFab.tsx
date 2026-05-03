'use client';

import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';

interface EViFabProps {
  readonly onOpen: () => void;
  readonly isOpen: boolean;
}

export default function EViFab({ onOpen, isOpen }: EViFabProps) {
  const { t } = useLocale();

  if (isOpen) return null;

  return (
    <button
      type="button"
      onClick={() => { hapticLight(); onOpen(); }}
      aria-label={t('evi_fab_label')}
      className="fixed right-3 bottom-[calc(55vh+64px)] lg:hidden z-[750] w-14 h-14 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-base shadow-lg shadow-black/40 flex items-center justify-center active:scale-[0.96] transition-transform"
    >
      eVi
    </button>
  );
}
