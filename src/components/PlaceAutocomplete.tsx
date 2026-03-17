'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchPlaces, type NominatimResult } from '@/lib/nominatim';

interface PlaceAutocompleteProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (result: NominatimResult) => void;
  readonly placeholder: string;
  readonly label: string;
}

const DEBOUNCE_MS = 400;

export default function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  label,
}: PlaceAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<readonly NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search
  const handleSearch = useCallback(
    (query: string) => {
      // Cancel previous request
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);

      if (query.trim().length < 2) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const results = await searchPlaces(query, controller.signal);
          setSuggestions(results);
          setIsOpen(results.length > 0);
          setActiveIndex(-1);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSuggestions([]);
          setIsOpen(false);
        } finally {
          setIsLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);
      handleSearch(val);
    },
    [onChange, handleSearch],
  );

  const handleSelectSuggestion = useCallback(
    (result: NominatimResult) => {
      onChange(result.displayName);
      onSelect(result);
      setSuggestions([]);
      setIsOpen(false);
    },
    [onChange, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [isOpen, suggestions, activeIndex, handleSelectSuggestion],
  );

  // Shorten display name for dropdown (remove ", Vietnam" and trailing parts)
  const shortenName = (name: string): string => {
    const parts = name.split(', ');
    // Keep first 3-4 meaningful parts
    return parts.slice(0, Math.min(parts.length - 1, 4)).join(', ');
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs text-[var(--color-muted)] mb-1 block">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-muted)]"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-surface-hover)] rounded-lg shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((result, index) => (
            <li key={result.placeId}>
              <button
                type="button"
                onClick={() => handleSelectSuggestion(result)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  index === activeIndex
                    ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                    : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'
                }`}
              >
                <span className="block truncate">{shortenName(result.displayName)}</span>
                <span className="block text-xs text-[var(--color-muted)] truncate">
                  {result.displayName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}