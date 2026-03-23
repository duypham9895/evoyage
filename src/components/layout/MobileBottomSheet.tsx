'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

type SnapPoint = 'peek' | 'half' | 'full';

const SNAP_HEIGHTS: Record<SnapPoint, number> = {
  peek: 120,  // Handle + tab bar + context hint
  half: 55,   // Percentage of viewport
  full: 92,   // Almost full screen
};

interface MobileBottomSheetProps {
  readonly children: ReactNode;
  readonly initialSnap?: SnapPoint;
  /** Set snap + increment trigger to force re-snap even to the same point */
  readonly snapTo?: { point: SnapPoint; trigger: number };
  readonly onSwipeLeft?: () => void;
  readonly onSwipeRight?: () => void;
}

export default function MobileBottomSheet({
  children,
  initialSnap = 'half',
  snapTo,
  onSwipeLeft,
  onSwipeRight,
}: MobileBottomSheetProps) {
  const [snap, setSnap] = useState<SnapPoint>(initialSnap);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Allow parent to control snap point (e.g., auto-expand on results)
  useEffect(() => {
    if (snapTo) {
      setSnap(snapTo.point);
    }
  }, [snapTo]);

  const getHeightPx = useCallback((point: SnapPoint): number => {
    if (typeof window === 'undefined') return 400;
    if (point === 'peek') return SNAP_HEIGHTS.peek;
    return (window.innerHeight * SNAP_HEIGHTS[point]) / 100;
  }, []);

  const currentHeight = isDragging
    ? startHeightRef.current - dragOffset
    : getHeightPx(snap);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true);
      startYRef.current = e.touches[0].clientY;
      startHeightRef.current = getHeightPx(snap);
    },
    [snap, getHeightPx],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    setDragOffset(deltaY);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const finalHeight = startHeightRef.current - dragOffset;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Snap to nearest point
    const peekH = SNAP_HEIGHTS.peek;
    const halfH = (vh * SNAP_HEIGHTS.half) / 100;
    const fullH = (vh * SNAP_HEIGHTS.full) / 100;

    const distances: [SnapPoint, number][] = [
      ['peek', Math.abs(finalHeight - peekH)],
      ['half', Math.abs(finalHeight - halfH)],
      ['full', Math.abs(finalHeight - fullH)],
    ];

    distances.sort((a, b) => a[1] - b[1]);
    setSnap(distances[0][0]);
    setDragOffset(0);
  }, [isDragging, dragOffset]);

  // Also handle mouse for testing on desktop
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = e.clientY - startYRef.current;
      setDragOffset(deltaY);
    };
    const handleMouseUp = () => {
      if (isDragging) handleTouchEnd();
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleTouchEnd]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      startYRef.current = e.clientY;
      startHeightRef.current = getHeightPx(snap);
    },
    [snap, getHeightPx],
  );

  // ─── Horizontal swipe detection for tab switching ───
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleContentTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - swipeStartRef.current.x;
    const deltaY = endY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      }
    }
  }, [onSwipeLeft, onSwipeRight]);

  return (
    <div
      ref={sheetRef}
      data-testid="bottom-sheet"
      className="fixed bottom-0 left-0 right-0 z-40 flex flex-col bg-[var(--color-surface)] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.5)] border-t border-[var(--color-surface-hover)] lg:hidden"
      style={{
        height: `${Math.max(SNAP_HEIGHTS.peek, Math.min(currentHeight, typeof window !== 'undefined' ? window.innerHeight * 0.92 : 800))}px`,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        willChange: 'height',
      }}
    >
      {/* Drag handle */}
      <div
        data-testid="sheet-handle"
        className="shrink-0 flex flex-col items-center pt-2 pb-2 cursor-grab active:cursor-grabbing touch-none select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="w-12 h-1.5 rounded-full bg-[var(--color-muted)]/50" />
      </div>

      {/* Content area — flex column so EVi can use flex-1 for its layout */}
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden overscroll-contain px-4 pb-safe"
        onTouchStart={handleContentTouchStart}
        onTouchEnd={handleContentTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
