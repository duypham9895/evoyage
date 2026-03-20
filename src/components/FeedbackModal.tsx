'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '@/lib/locale';
import StarRating from './StarRating';
import type { FeedbackCategory } from '@/lib/feedback/constants';

interface FeedbackModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly stationContext?: {
    readonly stationId: string;
    readonly stationName: string;
  };
}

type ModalStep = 'category' | 'form' | 'success' | 'error';

const CATEGORIES: readonly FeedbackCategory[] = [
  'REPORT_ISSUE',
  'REQUEST_FEATURE',
  'CONTACT_SUPPORT',
  'STATION_DATA_ERROR',
  'ROUTE_FEEDBACK',
  'GENERAL_FEEDBACK',
];

export default function FeedbackModal({
  isOpen,
  onClose,
  stationContext,
}: FeedbackModalProps) {
  const { t } = useLocale();
  const formOpenedAt = useRef(Date.now());
  const modalRef = useRef<HTMLDivElement>(null);

  // Form state
  const [step, setStep] = useState<ModalStep>('category');
  const [category, setCategory] = useState<FeedbackCategory | null>(
    stationContext ? 'STATION_DATA_ERROR' : null,
  );
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [useCase, setUseCase] = useState('');
  const [correctInfo, setCorrectInfo] = useState('');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [stationName, setStationName] = useState(stationContext?.stationName ?? '');
  const [honeypot, setHoneypot] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Restore email from localStorage
  useEffect(() => {
    const savedEmail = localStorage.getItem('evoyage-feedback-email');
    if (savedEmail) setEmail(savedEmail);
  }, []);

  // If stationContext provided, skip to form
  useEffect(() => {
    if (stationContext) {
      setStep('form');
      setCategory('STATION_DATA_ERROR');
      formOpenedAt.current = Date.now();
    }
  }, [stationContext]);

  // Close on Escape + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus trap: keep Tab within the modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus the modal on open
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-close success after 3 seconds
  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [step, onClose]);

  const handleSelectCategory = useCallback((cat: FeedbackCategory) => {
    setCategory(cat);
    setStep('form');
    formOpenedAt.current = Date.now();
  }, []);

  const handleBack = useCallback(() => {
    if (stationContext) {
      onClose();
    } else {
      setStep('category');
    }
  }, [stationContext, onClose]);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (description.length < 10) {
      errors.description = t('feedback_min_chars');
    }

    if (category === 'CONTACT_SUPPORT' && !email.trim()) {
      errors.email = t('feedback_email_required');
    } else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('feedback_email_invalid');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [description, email, category, t]);

  const handleSubmit = useCallback(async () => {
    if (!category || !validate()) return;

    setIsSubmitting(true);
    setValidationErrors({});

    // Save email for next time
    if (email.trim()) {
      localStorage.setItem('evoyage-feedback-email', email.trim());
    }

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          email: email.trim() || undefined,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          stationId: stationContext?.stationId || undefined,
          stationName: stationName.trim() || undefined,
          stepsToReproduce: stepsToReproduce.trim() || undefined,
          useCase: useCase.trim() || undefined,
          correctInfo: correctInfo.trim() || undefined,
          rating,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          routeParams: window.location.search || undefined,
          honeypot,
          formOpenedAt: formOpenedAt.current,
        }),
      });

      if (response.ok) {
        setStep('success');
      } else {
        const data = await response.json().catch(() => null);
        if (response.status === 429) {
          setValidationErrors({ submit: t('feedback_rate_limit') });
        } else if (data?.details) {
          // Map Zod errors
          const errors: Record<string, string> = {};
          for (const issue of data.details) {
            const field = issue.path?.[0];
            if (field) errors[String(field)] = issue.message;
          }
          setValidationErrors(errors);
        } else {
          setStep('error');
        }
      }
    } catch {
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    category, description, email, name, phone, stationContext,
    stationName, stepsToReproduce, useCase, correctInfo, rating,
    honeypot, validate, t,
  ]);

  if (!isOpen) return null;

  const descriptionPlaceholder = (() => {
    switch (category) {
      case 'REPORT_ISSUE': return t('feedback_ph_report');
      case 'REQUEST_FEATURE': return t('feedback_ph_feature');
      case 'CONTACT_SUPPORT': return t('feedback_ph_support');
      case 'STATION_DATA_ERROR': return t('feedback_ph_station');
      case 'ROUTE_FEEDBACK': return t('feedback_ph_route');
      case 'GENERAL_FEEDBACK': return t('feedback_ph_general');
      default: return t('feedback_ph_general');
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('feedback_title')}
    >
      <div
        ref={modalRef}
        className="
          bg-[var(--color-surface)] w-full sm:max-w-[480px]
          sm:rounded-2xl rounded-t-2xl
          shadow-2xl
          max-h-[85vh] overflow-y-auto
          animate-[modalSlideUp_200ms_ease-out]
          sm:animate-[modalFadeIn_150ms_ease-out]
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-surface-hover)] sticky top-0 bg-[var(--color-surface)] z-10">
          <div className="flex items-center gap-3">
            {step === 'form' && (
              <button
                onClick={handleBack}
                className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                aria-label={t('feedback_back')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">
              {step === 'form' && category
                ? t(`feedback_cat_${category.toLowerCase()}` as Parameters<typeof t>[0])
                : t('feedback_title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-hover)] text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
            aria-label={t('cancel')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center py-2">
          <div className="w-10 h-1 rounded-full bg-[var(--color-muted)]/30" />
        </div>

        <div className="px-5 pb-5">
          {/* ─── Category Selection ─── */}
          {step === 'category' && (
            <div className="py-4">
              <p className="text-sm text-[var(--color-muted)] mb-4">
                {t('feedback_category_prompt')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleSelectCategory(cat)}
                    className="
                      flex items-center justify-center
                      px-4 py-3.5 rounded-xl
                      bg-[var(--color-background)] border border-[var(--color-surface-hover)]
                      hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]
                      transition-all duration-150
                      text-[var(--color-foreground)]
                    "
                  >
                    <span className="text-sm font-medium text-center leading-tight">
                      {t(`feedback_cat_${cat.toLowerCase()}` as Parameters<typeof t>[0])}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Form ─── */}
          {step === 'form' && category && (
            <div className="py-4 space-y-4">
              {/* Honeypot — hidden from humans */}
              <div className="absolute opacity-0 h-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="feedback-website">Website</label>
                <input
                  id="feedback-website"
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Station name (STATION_DATA_ERROR) */}
              {category === 'STATION_DATA_ERROR' && (
                <div>
                  <label htmlFor="fb-station" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                    {t('feedback_field_station')}
                  </label>
                  <input
                    id="fb-station"
                    type="text"
                    value={stationName}
                    onChange={(e) => setStationName(e.target.value)}
                    placeholder={t('feedback_ph_station_name')}
                    maxLength={200}
                    readOnly={Boolean(stationContext)}
                    className="w-full px-4 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
              )}

              {/* Description (required) */}
              <div>
                <label htmlFor="fb-description" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                  {t('feedback_field_description')} <span className="text-[var(--color-danger)]">*</span>
                </label>
                <textarea
                  id="fb-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={descriptionPlaceholder}
                  rows={4}
                  maxLength={2000}
                  className={`w-full px-4 py-3 bg-[var(--color-background)] border rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-y ${
                    validationErrors.description
                      ? 'border-[var(--color-danger)]'
                      : 'border-[var(--color-surface-hover)]'
                  }`}
                />
                <div className="flex justify-between mt-1">
                  {validationErrors.description ? (
                    <span className="text-xs text-[var(--color-danger)]">
                      {validationErrors.description}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">
                      {t('feedback_min_chars')}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-muted)]">
                    {description.length}/2000
                  </span>
                </div>
              </div>

              {/* Rating (ROUTE_FEEDBACK) */}
              {category === 'ROUTE_FEEDBACK' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                    {t('feedback_field_rating')}
                  </label>
                  <StarRating value={rating} onChange={setRating} />
                </div>
              )}

              {/* Steps to reproduce (REPORT_ISSUE) */}
              {category === 'REPORT_ISSUE' && (
                <div>
                  <label htmlFor="fb-steps" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                    {t('feedback_field_steps')}
                  </label>
                  <textarea
                    id="fb-steps"
                    value={stepsToReproduce}
                    onChange={(e) => setStepsToReproduce(e.target.value)}
                    placeholder={t('feedback_ph_steps')}
                    rows={2}
                    maxLength={1000}
                    className="w-full px-4 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-y"
                  />
                </div>
              )}

              {/* Use case (REQUEST_FEATURE) */}
              {category === 'REQUEST_FEATURE' && (
                <div>
                  <label htmlFor="fb-usecase" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                    {t('feedback_field_use_case')}
                  </label>
                  <textarea
                    id="fb-usecase"
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    placeholder={t('feedback_ph_use_case')}
                    rows={2}
                    maxLength={1000}
                    className="w-full px-4 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-y"
                  />
                </div>
              )}

              {/* Correct info (STATION_DATA_ERROR) */}
              {category === 'STATION_DATA_ERROR' && (
                <div>
                  <label htmlFor="fb-correct" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                    {t('feedback_field_correct_info')}
                  </label>
                  <textarea
                    id="fb-correct"
                    value={correctInfo}
                    onChange={(e) => setCorrectInfo(e.target.value)}
                    placeholder={t('feedback_ph_correct_info')}
                    rows={2}
                    maxLength={1000}
                    className="w-full px-4 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-y"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="fb-email" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                  {t('feedback_field_email')}
                  {category === 'CONTACT_SUPPORT' && (
                    <span className="text-[var(--color-danger)]"> *</span>
                  )}
                </label>
                <input
                  id="fb-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  maxLength={200}
                  className={`w-full px-4 py-3 bg-[var(--color-background)] border rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors ${
                    validationErrors.email
                      ? 'border-[var(--color-danger)]'
                      : 'border-[var(--color-surface-hover)]'
                  }`}
                />
                {validationErrors.email ? (
                  <span className="text-xs text-[var(--color-danger)] mt-1 block">
                    {validationErrors.email}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--color-muted)] mt-1 block">
                    {t('feedback_email_hint')}
                  </span>
                )}
              </div>

              {/* Name + Phone (CONTACT_SUPPORT) */}
              {category === 'CONTACT_SUPPORT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="fb-name" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                      {t('feedback_field_name')}
                    </label>
                    <input
                      id="fb-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('feedback_ph_name')}
                      maxLength={100}
                      className="w-full px-4 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="fb-phone" className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
                      {t('feedback_field_phone')}
                    </label>
                    <input
                      id="fb-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0912 345 678"
                      maxLength={20}
                      className="w-full px-4 py-3 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Submit error */}
              {validationErrors.submit && (
                <div className="p-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-sm">
                  {validationErrors.submit}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || description.length < 10}
                className={`
                  w-full py-3 rounded-xl font-semibold text-base transition-all
                  ${isSubmitting || description.length < 10
                    ? 'bg-[var(--color-accent)]/50 text-[var(--color-background)] cursor-not-allowed'
                    : 'bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98]'
                  }
                `}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[var(--color-background)] border-t-transparent rounded-full animate-spin" />
                    {t('feedback_submitting')}
                  </span>
                ) : (
                  t('feedback_submit')
                )}
              </button>
            </div>
          )}

          {/* ─── Success ─── */}
          {step === 'success' && (
            <div className="py-12 text-center space-y-3">
              <h3 className="text-lg font-semibold text-[var(--color-accent)] animate-[successPop_300ms_ease-out]">
                {t('feedback_success_title')}
              </h3>
              <p className="text-sm text-[var(--color-muted)]">
                {t('feedback_success_message')}
              </p>
              {email && (
                <p className="text-sm text-[var(--color-muted)]">
                  {t('feedback_success_reply')}
                </p>
              )}
            </div>
          )}

          {/* ─── Error ─── */}
          {step === 'error' && (
            <div className="py-12 text-center space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                {t('feedback_error_message')}
              </p>
              <button
                onClick={() => setStep('form')}
                className="px-6 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                {t('feedback_retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
