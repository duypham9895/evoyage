'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from '@/lib/locale';
import { useEVi } from '@/hooks/useEVi';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { hapticLight } from '@/lib/haptics';
import type { EViTripParams } from '@/lib/evi/types';
import { onStationAskEVi } from '@/lib/events/station-events';
import StationCard from '@/components/StationCard';

// ── Types ──

interface SuggestionChip {
  readonly label: string;
  readonly action: 'message' | 'find_stations';
}

interface EViProps {
  readonly onTripParsed: (params: EViTripParams) => void;
  readonly onPlanTrip?: (params: EViTripParams) => void;
  readonly onFindNearbyStations?: () => void;
  readonly isPlanning?: boolean;
}

// ── Constants ──

const FIRST_VISIT_CHIPS = [
  'Đi Đà Lạt cuối tuần',
  'SG ra Vũng Tàu, VF5',
  'Hà Nội đi Đà Nẵng',
];

/** Contextual trip suggestions based on time of day and day of week */
const CONTEXTUAL_CHIPS: Record<string, readonly string[]> = {
  weekend: ['Đi Đà Lạt cuối tuần', 'SG ra Vũng Tàu', 'Hà Nội đi Sa Pa'],
  morning: ['SG đi Phan Thiết hôm nay', 'Đi Nha Trang, VF8', 'Hà Nội ra Hạ Long'],
  evening: ['Kế hoạch đi Đà Lạt ngày mai', 'SG đi Cần Thơ', 'Đà Nẵng đi Huế'],
  default: ['SG đi Phan Thiết', 'Hà Nội ra Hạ Long', 'Đi Nha Trang, VF8'],
};

// ── Helpers ──

function getGreetingKey(isFirstVisit: boolean): string {
  if (isFirstVisit) return 'evi_greeting_first';
  const hour = new Date().getHours();
  if (hour < 12) return 'evi_greeting_morning';
  if (hour >= 18) return 'evi_greeting_evening';
  return 'evi_greeting_return';
}

function getContextualTimeKey(): string {
  const day = new Date().getDay();
  if (day === 0 || day === 6) return 'weekend';
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour >= 17) return 'evening';
  return 'default';
}

function buildSuggestionChips(
  isFirstVisit: boolean,
  recentTrips: readonly { start: string; end: string; vehicleName?: string | null }[],
  findStationsLabel: string,
): readonly SuggestionChip[] {
  if (isFirstVisit) {
    return FIRST_VISIT_CHIPS.map((label) => ({ label, action: 'message' as const }));
  }

  const chips: SuggestionChip[] = [];
  const seen = new Set<string>();

  // 1. Personalized — from trip history (max 2, deduplicated)
  for (const trip of recentTrips.slice(0, 2)) {
    const startShort = trip.start.split(',')[0];
    const endShort = trip.end.split(',')[0];
    const vehicle = trip.vehicleName ? `, ${trip.vehicleName.replace(/^VinFast\s+/i, '')}` : '';
    const label = `${startShort} → ${endShort}${vehicle}`;
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push({ label, action: 'message' });
  }

  // 2. Contextual — fill remaining trip slots (up to 3 total trip chips)
  const contextKey = getContextualTimeKey();
  const contextual = CONTEXTUAL_CHIPS[contextKey] ?? CONTEXTUAL_CHIPS.default;
  for (const label of contextual) {
    if (chips.length >= 3) break;
    if (seen.has(label)) continue;
    chips.push({ label, action: 'message' });
    seen.add(label);
  }

  // 3. Quick action — find nearby stations
  chips.push({ label: findStationsLabel, action: 'find_stations' });

  return chips;
}

// ── Sub-components ──

function EViAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-surface-hover)] border-[1.5px] border-[var(--color-accent)] flex items-center justify-center">
      <span className="text-[var(--color-accent)] font-[family-name:var(--font-heading)] font-semibold text-[11px]">eVi</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <EViAvatar />
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-[var(--color-surface)] max-w-[80%]">
        <div className="flex gap-1" aria-label="eVi is typing">
          <span className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function LocationBadge({ address }: { readonly address: string }) {
  const parts = address.split(',').map((p) => p.trim());
  const shortLabel = parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0] ?? address;

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border border-[var(--color-accent)]/20">
      <span className="truncate max-w-[200px]" title={address}>{shortLabel}</span>
    </div>
  );
}

// ── Chip class helpers ──

const CHIP_TRIP = 'px-3.5 py-2 rounded-full text-[13px] font-medium bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[rgba(0,212,170,0.25)] hover:border-[var(--color-accent)]/40 transition-colors min-h-[40px] min-w-[40px] max-w-full truncate';

const CHIP_SECONDARY = 'px-3.5 py-2 rounded-full text-[13px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)] transition-colors min-h-[40px] min-w-[40px] max-w-full truncate';

// ── Main Component ──

export default function EVi({ onTripParsed, onPlanTrip, onFindNearbyStations, isPlanning = false }: EViProps) {
  const { t, locale } = useLocale();
  const {
    state,
    messages,
    lastResponse,
    userLocation,
    isFirstVisit,
    recentTrips,
    followUpSuggestions,
    isSuggestionsLoading,
    sendMessage,
    reset,
  } = useEVi();
  const {
    isSupported,
    isListening,
    isProcessing,
    transcript,
    error: speechError,
    startListening,
    stopListening,
  } = useSpeechInput(locale);

  const [inputValue, setInputValue] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevListeningRef = useRef(false);

  // ── Build suggestion chips (memoized) ──
  const findStationsLabel = t('evi_find_stations' as Parameters<typeof t>[0]);
  const suggestionChips = useMemo(
    () => buildSuggestionChips(isFirstVisit, recentTrips, findStationsLabel),
    [isFirstVisit, recentTrips, findStationsLabel],
  );

  // ── Auto-scroll on new messages (within chat area only) ──
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, state]);

  // ── Send transcript when listening stops ──
  useEffect(() => {
    if (prevListeningRef.current && !isListening && transcript.trim()) {
      sendMessage(transcript.trim());
    }
    prevListeningRef.current = isListening;
  }, [isListening, transcript, sendMessage]);

  // ── Handlers ──

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    sendMessage(text);
  }, [inputValue, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChipClick = useCallback(
    (chip: SuggestionChip) => {
      hapticLight();
      if (chip.action === 'find_stations') {
        onFindNearbyStations?.();
      } else {
        sendMessage(chip.label);
      }
    },
    [sendMessage, onFindNearbyStations],
  );

  const handleMicPress = useCallback(() => {
    hapticLight();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const handlePlan = useCallback(() => {
    if (lastResponse?.tripParams) {
      hapticLight();
      if (onPlanTrip) {
        onPlanTrip(lastResponse.tripParams);
      } else {
        onTripParsed(lastResponse.tripParams);
      }
    }
  }, [lastResponse, onTripParsed, onPlanTrip]);

  const handleEdit = useCallback(() => {
    if (lastResponse?.tripParams) {
      hapticLight();
      onTripParsed(lastResponse.tripParams);
    }
  }, [lastResponse, onTripParsed]);

  const handleRetry = useCallback(() => {
    hapticLight();
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);

  const handleStartOver = useCallback(() => {
    hapticLight();
    reset();
  }, [reset]);

  // Subscribe to "Ask eVi" events from map markers
  useEffect(() => {
    const unsubscribe = onStationAskEVi((payload) => {
      setInputValue(t('evi_ask_about_station' as Parameters<typeof t>[0], { name: payload.stationName }));
      inputRef.current?.focus();
    });
    return unsubscribe;
  }, [t]);

  const handleFollowUpOption = useCallback(
    (label: string) => {
      hapticLight();
      sendMessage(label);
    },
    [sendMessage],
  );

  const handleFollowUpLocationSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  // ── Greeting text ──
  const greetingKey = getGreetingKey(isFirstVisit);
  const greetingText = t(greetingKey as Parameters<typeof t>[0]);

  const isIdle = state === 'idle' && messages.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Location badge */}
      {userLocation && (
        <div className="px-4 pt-2 pb-1">
          <LocationBadge address={userLocation.address} />
        </div>
      )}

      {/* Chat messages area */}
      <div
        ref={chatContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2"
        role="log"
        aria-live="polite"
      >
        {/* eVi greeting */}
        <div className="flex items-end gap-2">
          <EViAvatar />
          <div className="rounded-2xl rounded-bl-sm px-3 py-2 bg-[var(--color-surface)] max-w-[80%]">
            <p className="text-[13px] text-[var(--color-foreground)]">
              {greetingText}
            </p>
            {isFirstVisit && (
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                {t('evi_placeholder')}
              </p>
            )}
          </div>
        </div>

        {/* Suggestion chips (idle, no messages) */}
        {isIdle && (
          <div className="pl-10" role="listbox" aria-label="Suggested trips">
            <div className="flex flex-wrap gap-2">
              {suggestionChips.map((chip, idx) => (
                <button
                  key={`${idx}-${chip.label}`}
                  role="option"
                  aria-selected={false}
                  onClick={() => handleChipClick(chip)}
                  className={chip.action === 'find_stations' ? CHIP_SECONDARY : CHIP_TRIP}
                >
                  {chip.label}
                </button>
              ))}
            </div>

          </div>
        )}

        {/* Conversation messages */}
        {messages.map((msg, idx) => {
          if (msg.role === 'user') {
            return (
              <div key={idx} className="flex justify-end">
                <div className="rounded-2xl rounded-br-sm px-4 py-3 bg-[var(--color-surface-hover)] max-w-[75%]">
                  <p className="text-sm text-[var(--color-foreground)]">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          }
          return (
            <div key={idx} className="flex items-end gap-2">
              <EViAvatar />
              <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-[var(--color-surface)] max-w-[75%]">
                <p className="text-sm text-[var(--color-foreground)]">
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {state === 'processing' && <TypingIndicator />}

        {/* Error recovery */}
        {state === 'error' && (
          <div className="pl-10">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRetry}
                className={CHIP_TRIP}
              >
                {t('evi_retry' as Parameters<typeof t>[0])}
              </button>
              <button
                onClick={handleStartOver}
                className={CHIP_SECONDARY}
              >
                {t('evi_start_over' as Parameters<typeof t>[0])}
              </button>
            </div>
          </div>
        )}

        {/* Follow-up UI */}
        {state === 'follow_up' && lastResponse && (
          <div className="pl-10">
            {lastResponse.followUpType === 'vehicle_pick' &&
              lastResponse.suggestedOptions.length > 0 && (
                <div className="flex flex-wrap gap-2" role="listbox" aria-label="Vehicle options">
                  {lastResponse.suggestedOptions.map((opt) => (
                    <button
                      key={opt.label}
                      role="option"
                      aria-selected={false}
                      onClick={() => handleFollowUpOption(opt.label)}
                      className={CHIP_TRIP}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            {lastResponse.followUpType === 'location_input' && (
              <form onSubmit={handleFollowUpLocationSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={t('evi_location_prompt')}
                  className="flex-1 rounded-xl px-3 py-2 text-sm bg-[var(--color-surface)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-background)] disabled:opacity-40 transition-opacity font-medium"
                >
                  →
                </button>
              </form>
            )}

            {/* AI-generated follow-up suggestions */}
            {isSuggestionsLoading && (
              <div className="flex gap-2 mt-2" aria-label={t('evi_suggestions_loading' as Parameters<typeof t>[0])}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-11 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse"
                    style={{ width: `${80 + i * 20}px` }}
                  />
                ))}
              </div>
            )}
            {!isSuggestionsLoading && followUpSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2" role="listbox" aria-label={t('evi_suggestions_label' as Parameters<typeof t>[0])}>
                {followUpSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    role="option"
                    aria-selected={false}
                    onClick={() => handleFollowUpOption(suggestion)}
                    className={CHIP_TRIP}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nearby station cards (from eVi station search) */}
        {lastResponse?.nearbyStations && lastResponse.nearbyStations.length > 0 && (
          <div className="pl-10 space-y-2">
            {lastResponse.nearbyStations.map((station) => (
              <StationCard
                key={`${station.latitude}-${station.longitude}`}
                station={station}
              />
            ))}
          </div>
        )}

        {/* Parsed result card */}
        {state === 'complete' && lastResponse?.tripParams && (
          <div className="pl-10">
            <div className="rounded-2xl p-4 bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
              <div className="space-y-1.5 text-sm">
                {lastResponse.tripParams.start && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted)] w-12 text-xs">{t('evi_from')}</span>
                    <span className="text-[var(--color-foreground)]">{lastResponse.tripParams.start}</span>
                  </div>
                )}
                {lastResponse.tripParams.end && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted)] w-12 text-xs">{t('evi_to')}</span>
                    <span className="text-[var(--color-foreground)]">{lastResponse.tripParams.end}</span>
                  </div>
                )}
                {lastResponse.tripParams.vehicleName && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted)] w-12 text-xs">{t('evi_vehicle')}</span>
                    <span className="text-[var(--color-foreground)]">{lastResponse.tripParams.vehicleName}</span>
                  </div>
                )}
                {lastResponse.tripParams.currentBattery != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted)] w-12 text-xs">{t('evi_battery')}</span>
                    <span className="text-[var(--color-foreground)]">{lastResponse.tripParams.currentBattery}%</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePlan}
                  disabled={isPlanning}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-[var(--color-background)] min-h-[44px] transition-opacity ${isPlanning ? 'opacity-70 cursor-wait' : 'hover:opacity-90'}`}
                >
                  {isPlanning ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-[var(--color-background)] rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-[var(--color-background)] rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-[var(--color-background)] rounded-full animate-bounce [animation-delay:300ms]" />
                      </span>
                      {t('planning')}
                    </span>
                  ) : (
                    t('evi_plan_button')
                  )}
                </button>
                <button
                  onClick={handleEdit}
                  disabled={isPlanning}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-foreground)] min-h-[44px] transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  {t('evi_edit_button')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Live transcript while listening */}
        {isListening && transcript && (
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-sm px-4 py-3 bg-[var(--color-surface-hover)] max-w-[75%] opacity-60">
              <p className="text-sm text-[var(--color-foreground)] italic">
                {transcript}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Input area — pinned at bottom via flex layout */}
      <div className="shrink-0 px-3 pb-1 pt-1.5 border-t border-[var(--color-border)]">
        {/* Speech error feedback */}
        {speechError && !isListening && (
          <p className="text-xs text-[var(--color-danger)] text-center mb-2">
            {speechError === 'previously_denied'
              ? t('evi_mic_previously_denied' as Parameters<typeof t>[0])
              : speechError === 'not_allowed'
                ? t('evi_mic_denied' as Parameters<typeof t>[0])
                : speechError === 'browser_unsupported'
                  ? t('evi_mic_unsupported' as Parameters<typeof t>[0])
                  : speechError === 'no_speech'
                    ? t('evi_no_speech' as Parameters<typeof t>[0])
                    : speechError === 'network'
                      ? t('evi_speech_network_error' as Parameters<typeof t>[0])
                      : t('evi_speech_error' as Parameters<typeof t>[0])}
          </p>
        )}

        {/* Listening status */}
        {isListening && (
          <p className="text-xs text-[var(--color-accent)] text-center mb-2 animate-pulse">
            {t('evi_listening')}
          </p>
        )}

        {/* Processing status (Whisper engine: uploading/transcribing) */}
        {isProcessing && !isListening && (
          <p className="text-xs text-[var(--color-text-secondary)] text-center mb-2 animate-pulse">
            {t('evi_processing_voice' as Parameters<typeof t>[0])}
          </p>
        )}

        <div className="flex items-center gap-2">
          {/* Mic button — subtle outlined style per DESIGN.md */}
          {isSupported && (
            <button
              onClick={handleMicPress}
              aria-label={t('evi_speak')}
              className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full transition-colors border ${
                isListening
                  ? 'bg-[var(--color-danger)] border-[var(--color-danger)] text-white animate-pulse'
                  : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('evi_placeholder')}
            disabled={state === 'processing'}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm bg-[var(--color-surface)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40 disabled:opacity-50 min-h-[44px]"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || state === 'processing'}
            title={!inputValue.trim() ? t('evi_type_message' as Parameters<typeof t>[0]) : undefined}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-background)] disabled:opacity-40 transition-opacity font-medium"
            aria-label="Send"
          >
            <span className="text-lg">→</span>
          </button>
        </div>

      </div>
    </div>
  );
}
