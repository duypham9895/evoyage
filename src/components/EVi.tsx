'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import { useEVi } from '@/hooks/useEVi';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { hapticLight } from '@/lib/haptics';
import type { EViTripParams } from '@/lib/evi/types';

// ── Props ──

interface EViProps {
  readonly onTripParsed: (params: EViTripParams) => void;
  readonly onPlanTrip?: (params: EViTripParams) => void;
}

// ── Constants ──

const FIRST_VISIT_CHIPS = [
  'Đi Đà Lạt cuối tuần',
  'SG ra Vũng Tàu, VF5',
  'Hà Nội đi Đà Nẵng',
];

const RETURN_VISIT_CHIPS = [
  'Đi Nha Trang, VF8',
  'SG đi Phan Thiết',
  'Hà Nội ra Hạ Long',
];

// ── Helpers ──

function getGreetingKey(isFirstVisit: boolean): string {
  if (isFirstVisit) return 'evi_greeting_first';
  const hour = new Date().getHours();
  if (hour < 12) return 'evi_greeting_morning';
  if (hour >= 18) return 'evi_greeting_evening';
  return 'evi_greeting_return';
}

// ── Sub-components ──

function EViAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#00D4AA] to-[#00A888] flex items-center justify-center text-sm">
      <span role="img" aria-label="eVi">🧭</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <EViAvatar />
      <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-[rgba(0,212,170,0.08)] max-w-[80%]">
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
  // Extract a short location label (e.g. "Quận 1, HCM") from the full address
  const parts = address.split(',').map((p) => p.trim());
  const shortLabel = parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0] ?? address;

  return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[rgba(0,212,170,0.12)] text-[var(--color-accent)]">
      <span>📍</span>
      <span className="truncate max-w-[200px]">{shortLabel}</span>
    </div>
  );
}

// ── Main Component ──

export default function EVi({ onTripParsed, onPlanTrip }: EViProps) {
  const { t } = useLocale();
  const {
    state,
    messages,
    lastResponse,
    userLocation,
    isFirstVisit,
    sendMessage,
    reset,
  } = useEVi();
  const {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  const [inputValue, setInputValue] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevListeningRef = useRef(false);

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
    (text: string) => {
      hapticLight();
      sendMessage(text);
    },
    [sendMessage],
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
      // Fill form AND auto-trigger planning
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
    // Resend the last user message
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);

  const handleStartOver = useCallback(() => {
    hapticLight();
    reset();
  }, [reset]);

  const handleFollowUpOption = useCallback(
    (label: string) => {
      hapticLight();
      sendMessage(label);
    },
    [sendMessage],
  );

  const handleFollowUpLocationSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
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
    <div className="flex flex-col h-full">
      {/* Location badge */}
      {userLocation && (
        <div className="px-4 pt-2 pb-1">
          <LocationBadge address={userLocation.address} />
        </div>
      )}

      {/* Chat messages area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        role="log"
        aria-live="polite"
      >
        {/* eVi greeting */}
        <div className="flex items-end gap-2">
          <EViAvatar />
          <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-[rgba(0,212,170,0.08)] max-w-[80%]">
            <p className="text-sm text-[var(--color-foreground)]">
              {greetingText}
            </p>
            {isFirstVisit && (
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {t('evi_placeholder')}
              </p>
            )}
          </div>
        </div>

        {/* Suggestion chips (idle, no messages) */}
        {isIdle && (
          <div className="pl-10" role="listbox" aria-label="Suggested trips">
            <div className="flex flex-wrap gap-2">
              {(isFirstVisit ? FIRST_VISIT_CHIPS : RETURN_VISIT_CHIPS).map((chip) => (
                <button
                  key={chip}
                  role="option"
                  aria-selected={false}
                  onClick={() => handleChipClick(chip)}
                  className="px-3 py-1.5 rounded-full text-xs border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[rgba(0,212,170,0.08)] transition-colors min-h-[44px] min-w-[44px]"
                >
                  {chip}
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
                <div className="rounded-2xl rounded-br-md px-4 py-3 bg-[var(--color-surface)] max-w-[80%]">
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
              <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-[rgba(0,212,170,0.08)] max-w-[80%]">
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
                className="px-3 py-1.5 rounded-full text-xs border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[rgba(0,212,170,0.08)] transition-colors min-h-[44px]"
              >
                {t('evi_retry' as Parameters<typeof t>[0])}
              </button>
              <button
                onClick={handleStartOver}
                className="px-3 py-1.5 rounded-full text-xs border border-[var(--color-muted)]/30 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors min-h-[44px]"
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
                      className="px-3 py-1.5 rounded-full text-xs border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[rgba(0,212,170,0.08)] transition-colors min-h-[44px] min-w-[44px]"
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
                  className="flex-1 rounded-xl px-3 py-2 text-sm bg-[var(--color-surface)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] border border-[var(--color-muted)]/20 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white disabled:opacity-40 transition-opacity"
                >
                  →
                </button>
              </form>
            )}
          </div>
        )}

        {/* Parsed result card */}
        {state === 'complete' && lastResponse?.tripParams && (
          <div className="pl-10">
            <div className="rounded-2xl p-4 bg-[var(--color-surface)] border border-[var(--color-muted)]/20 space-y-3">
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
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-white min-h-[44px] transition-opacity hover:opacity-90"
                >
                  {t('evi_plan_button')}
                </button>
                <button
                  onClick={handleEdit}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--color-muted)]/30 text-[var(--color-foreground)] min-h-[44px] transition-opacity hover:opacity-80"
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
            <div className="rounded-2xl rounded-br-md px-4 py-3 bg-[var(--color-surface)] max-w-[80%] opacity-60">
              <p className="text-sm text-[var(--color-foreground)] italic">
                {transcript}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Input area */}
      <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-[var(--color-background)] border-t border-[var(--color-muted)]/10">
        {/* Listening status */}
        {isListening && (
          <p className="text-xs text-[var(--color-accent)] text-center mb-2 animate-pulse">
            {t('evi_listening')}
          </p>
        )}

        <div className="flex items-center gap-2">
          {/* Mic button */}
          {isSupported && (
            <button
              onClick={handleMicPress}
              aria-label={t('evi_speak')}
              className={`relative flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-[var(--color-accent)] text-white'
              }`}
            >
              <span className="text-lg">🎤</span>
              <span className="absolute -top-1 -right-1 text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-muted)] leading-none">
                {t('evi_voice_beta')}
              </span>
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
            className="flex-1 rounded-xl px-3 py-2.5 text-sm bg-[var(--color-surface)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] border border-[var(--color-muted)]/20 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50 min-h-[44px]"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || state === 'processing'}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <span className="text-lg">→</span>
          </button>
        </div>

        {/* Manual entry link */}
        <div className="text-center mt-2">
          <button
            onClick={handleEdit}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            {t('evi_manual_link')} →
          </button>
        </div>
      </div>
    </div>
  );
}
