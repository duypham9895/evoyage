'use client';

import { useState, useCallback, type KeyboardEvent } from 'react';

interface StarRatingProps {
  readonly value: number | undefined;
  readonly onChange: (rating: number | undefined) => void;
  readonly size?: number;
}

/**
 * Reusable star rating component.
 * 5 clickable stars with keyboard navigation (arrow keys).
 * Click same star to deselect.
 */
export default function StarRating({ value, onChange, size = 32 }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const handleClick = useCallback(
    (star: number) => {
      // Tap same star to deselect
      onChange(value === star ? undefined : star);
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent, star: number) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(5, star + 1);
        onChange(next);
        // Focus the next star button
        const nextBtn = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null;
        nextBtn?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        const prev = Math.max(1, star - 1);
        onChange(prev);
        const prevBtn = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null;
        prevBtn?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick(star);
      }
    },
    [onChange, handleClick],
  );

  const displayValue = hovered ?? value ?? 0;

  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="Đánh giá">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= displayValue;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`Đánh giá ${star} sao`}
            tabIndex={star === (value ?? 1) ? 0 : -1}
            onClick={() => handleClick(star)}
            onKeyDown={(e) => handleKeyDown(e, star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] rounded"
            style={{ width: size, height: size }}
          >
            <svg
              viewBox="0 0 24 24"
              width={size}
              height={size}
              fill={filled ? 'var(--color-warn)' : 'none'}
              stroke={filled ? 'var(--color-warn)' : 'var(--color-muted)'}
              strokeWidth={1.5}
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        );
      })}
      {value && (
        <span className="text-sm text-[var(--color-muted)] ml-1">
          {value}/5
        </span>
      )}
    </div>
  );
}
