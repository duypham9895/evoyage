'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchPlaces, type NominatimResult } from '@/lib/nominatim';

interface PlaceAutocompleteProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (result: NominatimResult) => void;
  readonly placeholder: string;
  readonly label: string;
  readonly showGpsButton?: boolean;
}

const DEBOUNCE_MS = 400;

export default function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  label,
  showGpsButton = false,
}: PlaceAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<readonly NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleUseMyLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      const { latitude, longitude } = position.coords;

      // Reverse geocode to get place name
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=vi,en`,
        { headers: { 'User-Agent': 'EVoyage/1.0 (https://evoyagevn.vercel.app)' } }
      );
      if (response.ok) {
        const data = await response.json();
        const parts = String(data.display_name || '').split(', ');
        const shortName = parts.slice(0, 3).join(', ');
        onChange(shortName);
        onSelect({
          placeId: Number(data.place_id) || 0,
          displayName: String(data.display_name || ''),
          lat: latitude,
          lng: longitude,
          type: String(data.type || 'place'),
        });
      }
    } catch {
      // Silently fail — user can type manually
    } finally {
      setIsLocating(false);
    }
  }, [onChange, onSelect]);

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

  // Cleanup timer and abort on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
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
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="autocomplete-list"
          className="w-full px-3 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-xl text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-muted)]"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {showGpsButton && !value && !isLoading && (
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isLocating}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
            aria-label="Use my current location"
          >
            {isLocating ? (
              <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
            )}
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul id="autocomplete-list" role="listbox" className="absolute z-50 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-surface-hover)] rounded-lg shadow-lg overflow-hidden max-h-[240px] sm:max-h-[200px] overflow-y-auto">
          {suggestions.map((result, index) => (
            <li key={result.placeId} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={() => handleSelectSuggestion(result)}
                className={`w-full text-left px-3 py-3.5 text-sm transition-colors ${
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