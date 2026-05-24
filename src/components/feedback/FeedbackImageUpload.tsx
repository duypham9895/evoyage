'use client';

import { useState, useRef, useCallback } from 'react';
import { useLocale } from '@/lib/locale';

interface FeedbackImageUploadProps {
  readonly value: string | null;
  readonly onChange: (url: string | null) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';

export default function FeedbackImageUpload({ value, onChange }: FeedbackImageUploadProps) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/feedback/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg =
            data?.error === 'file_too_large'
              ? t('feedback_upload_too_large')
              : data?.error === 'invalid_type'
                ? t('feedback_upload_invalid_type')
                : data?.error === 'rate_limited'
                  ? t('feedback_upload_rate_limited')
                  : data?.error === 'upload_unavailable'
                    ? t('feedback_upload_unavailable')
                    : t('feedback_upload_failed');
          setError(msg);
          return;
        }
        const data = await res.json();
        if (typeof data.url === 'string') {
          onChange(data.url);
        }
      } catch {
        setError(t('feedback_upload_failed'));
      } finally {
        setIsUploading(false);
      }
    },
    [onChange, t],
  );

  const handlePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void upload(file);
      // Reset input so picking the same file again still triggers onChange
      e.target.value = '';
    },
    [upload],
  );

  const remove = useCallback(() => {
    onChange(null);
    setError(null);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <label className="text-sm text-[var(--color-text-secondary)]">
        {t('feedback_upload_label')}
      </label>

      {value ? (
        <div className="flex items-start gap-3">
          {/* Thumbnail — eslint-disable: external Blob URL, not a static asset */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={t('feedback_upload_preview_alt')}
            className="w-24 h-24 object-cover rounded-md border border-[var(--color-border)]"
          />
          <button
            type="button"
            onClick={remove}
            className="text-xs text-[var(--color-danger)] underline"
          >
            {t('feedback_upload_remove')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="px-3 py-2 rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {isUploading ? t('feedback_upload_uploading') : t('feedback_upload_pick')}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handlePick}
      />

      {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}

      <p className="text-xs text-[var(--color-muted)]">{t('feedback_upload_hint')}</p>
    </div>
  );
}
