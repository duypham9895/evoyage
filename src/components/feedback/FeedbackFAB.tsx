'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from '@/lib/locale';
import { useIsMobile } from '@/hooks/useIsMobile';
import { safeGetItem, safeSetItem, safeGetRaw, safeSetRaw } from '@/lib/safe-storage';
import { hapticLight } from '@/lib/haptics';

// Lazy-load the modal — no SSR (decision #7)
const FeedbackModal = dynamic(() => import('./FeedbackModal'), { ssr: false });

const BUTTON_SIZE = 44;
const EDGE_PADDING = 12;
const DRAG_THRESHOLD = 5;
const SNAP_DURATION = 200;
// MapLocateButton on desktop is `absolute bottom-20 right-4` inside the map.
// When FAB snaps to the right edge, push it above this zone so it never re-covers Locate.
const LOCATE_BOTTOM_OFFSET = 80; // bottom-20 = 5rem = 80px
const LOCATE_AVOIDANCE_GAP = 20;

interface SavedPosition {
  readonly x: number;
  readonly y: number;
  readonly edge: 'left' | 'right';
  readonly breakpoint: 'mobile' | 'desktop';
}

interface FeedbackFABProps {
  readonly stationContext?: {
    readonly stationId: string;
    readonly stationName: string;
  };
}

function clampY(y: number): number {
  if (typeof window === 'undefined') return y;
  return Math.max(48, Math.min(y, window.innerHeight - BUTTON_SIZE - 48));
}

export default function FeedbackFAB({ stationContext }: FeedbackFABProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const isMobile = useIsMobile();
  const breakpoint = isMobile ? 'mobile' : 'desktop' as const;

  // Drag state — null means "use CSS default position"
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wasDragged, setWasDragged] = useState(false);

  // Refs for drag tracking
  const startPosRef = useRef({ x: 0, y: 0 });
  const startPointerRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const wasDraggedRef = useRef(false);
  const currentPosRef = useRef<{ x: number; y: number } | null>(null);

  // ─── Restore saved position from localStorage ─────────
  useEffect(() => {
    const saved = safeGetItem<SavedPosition | null>('evoyage-fab-position', null);
    // Validate shape — localStorage is external data, don't trust blindly
    if (
      saved &&
      typeof saved.x === 'number' && !Number.isNaN(saved.x) &&
      typeof saved.y === 'number' && !Number.isNaN(saved.y) &&
      saved.breakpoint === breakpoint
    ) {
      const y = clampY(saved.y);
      const x = Math.max(EDGE_PADDING, Math.min(saved.x, window.innerWidth - BUTTON_SIZE - EDGE_PADDING));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration: localStorage-derived initial position can't be read in SSR initializer
      setDragPosition({ x, y });
    }
    // If no saved position or invalid: dragPosition stays null → CSS handles default
  }, [breakpoint]);

  // ─── Pulse animation ──────────────────────────────────
  useEffect(() => {
    const shouldPulse = !safeGetRaw('evoyage-feedback-seen');
    if (!shouldPulse) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration: localStorage flag can't be read in SSR initializer
    setShowPulse(true);
    const timer = setTimeout(() => {
      setShowPulse(false);
      safeSetRaw('evoyage-feedback-seen', '1');
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Phase 4 — allow nested components (e.g. StationAmenities) to open the
  // feedback dialog with a pre-selected category via window event so we
  // don't have to thread `onOpenFeedback` props all the way down.
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('evoyage:open-feedback', handler);
    return () => window.removeEventListener('evoyage:open-feedback', handler);
  }, []);

  // ─── Snap to nearest edge ─────────────────────────────
  const snapToEdge = useCallback(
    (currentX: number, currentY: number) => {
      if (typeof window === 'undefined') return;
      const vw = window.innerWidth;
      const midpoint = vw / 2;

      const edge: 'left' | 'right' =
        currentX + BUTTON_SIZE / 2 < midpoint ? 'left' : 'right';

      const snapX = edge === 'left'
        ? EDGE_PADDING
        : vw - BUTTON_SIZE - EDGE_PADDING;

      let snapY = clampY(currentY);

      // Avoid covering MapLocateButton when snapping to right edge on desktop
      if (edge === 'right' && breakpoint === 'desktop') {
        const locateTop = window.innerHeight - LOCATE_BOTTOM_OFFSET - BUTTON_SIZE;
        const locateBottom = window.innerHeight - LOCATE_BOTTOM_OFFSET;
        const fabBottom = snapY + BUTTON_SIZE;
        if (fabBottom > locateTop && snapY < locateBottom) {
          snapY = clampY(locateTop - LOCATE_AVOIDANCE_GAP - BUTTON_SIZE);
        }
      }

      setIsDragging(false);
      isDraggingRef.current = false;

      requestAnimationFrame(() => {
        const pos = { x: snapX, y: snapY };
        setDragPosition(pos);
        hapticLight();

        safeSetItem('evoyage-fab-position', {
          x: snapX,
          y: snapY,
          edge,
          breakpoint,
        } satisfies SavedPosition);
      });
    },
    [breakpoint],
  );

  // ─── Pointer handler ──────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isOpen) return; // disabled when modal open

      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      // Get current position from DOM (works whether CSS or inline positioned)
      const rect = el.getBoundingClientRect();
      const startPos = { x: rect.left, y: rect.top };

      startPointerRef.current = { x: e.clientX, y: e.clientY };
      startPosRef.current = startPos;
      currentPosRef.current = startPos;
      wasDraggedRef.current = false;
      setWasDragged(false);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startPointerRef.current.x;
        const dy = moveEvent.clientY - startPointerRef.current.y;
        const totalMovement = Math.sqrt(dx * dx + dy * dy);

        if (!isDraggingRef.current && totalMovement >= DRAG_THRESHOLD) {
          isDraggingRef.current = true;
          setIsDragging(true);
          wasDraggedRef.current = true;
          setWasDragged(true);
        }

        if (isDraggingRef.current) {
          const newX = startPosRef.current.x + dx;
          const newY = startPosRef.current.y + dy;
          currentPosRef.current = { x: newX, y: newY };
          setDragPosition({ x: newX, y: newY });
        }
      };

      const cleanup = () => {
        el.removeEventListener('pointermove', handlePointerMove);
        el.removeEventListener('pointerup', handlePointerUp);
        el.removeEventListener('pointercancel', handlePointerCancel);
      };

      const handlePointerUp = () => {
        cleanup();
        if (isDraggingRef.current && currentPosRef.current) {
          snapToEdge(currentPosRef.current.x, currentPosRef.current.y);
        } else {
          isDraggingRef.current = false;
        }
        // Reset so next tap isn't blocked
        wasDraggedRef.current = false;
        setWasDragged(false);
      };

      const handlePointerCancel = () => {
        cleanup();
        if (isDraggingRef.current && currentPosRef.current) {
          snapToEdge(currentPosRef.current.x, currentPosRef.current.y);
        }
        isDraggingRef.current = false;
        setIsDragging(false);
        wasDraggedRef.current = false;
        setWasDragged(false);
      };

      el.addEventListener('pointermove', handlePointerMove);
      el.addEventListener('pointerup', handlePointerUp);
      el.addEventListener('pointercancel', handlePointerCancel);
    },
    [isOpen, snapToEdge],
  );

  const handleOpen = useCallback(() => {
    if (wasDragged) return;
    setShowPulse(false);
    safeSetRaw('evoyage-feedback-seen', '1');
    setIsOpen(true);
  }, [wasDragged]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const ariaLabel = isDragging
    ? `${t('feedback_title')} — dragging`
    : t('feedback_title');

  // ─── Style: CSS default OR inline drag position ───────
  // When dragPosition is null, CSS classes handle positioning.
  // When dragPosition is set (user dragged or restored from localStorage),
  // inline styles override the CSS classes.
  const inlineStyle: React.CSSProperties = dragPosition
    ? {
        position: 'fixed' as const,
        left: dragPosition.x,
        top: dragPosition.y,
        right: 'auto',
        bottom: 'auto',
        transition: isDragging
          ? 'none'
          : `left ${SNAP_DURATION}ms ease-out, top ${SNAP_DURATION}ms ease-out`,
        zIndex: 800,
      }
    : {};

  return (
    <>
      <button
        onClick={handleOpen}
        onPointerDown={onPointerDown}
        aria-label={ariaLabel}
        title={t('feedback_title')}
        style={inlineStyle}
        className={`
          ${dragPosition ? '' : 'fixed z-[800] right-3 bottom-[calc(55vh+8px)] lg:bottom-36 lg:right-4'}
          w-11 h-11
          rounded-full
          bg-[var(--color-accent)] border border-[var(--color-accent-dim)]
          text-[var(--color-background)]
          shadow-lg shadow-black/40
          ${dragPosition ? '' : 'transition-all duration-200 ease-out'}
          hover:scale-105 hover:bg-[var(--color-surface-hover)]
          active:scale-95
          flex items-center justify-center
          touch-none
          ${isDragging ? 'cursor-grabbing opacity-85 scale-110' : 'cursor-grab'}
          ${showPulse ? 'animate-[fabPulse_2s_ease-in-out_infinite]' : ''}
        `}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="9" y1="10" x2="15" y2="10" />
          <line x1="12" y1="7" x2="12" y2="13" />
        </svg>
      </button>

      {isOpen && (
        <FeedbackModal
          isOpen={isOpen}
          onClose={handleClose}
          stationContext={stationContext}
        />
      )}
    </>
  );
}
