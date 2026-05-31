import { useEffect, useMemo, useRef, useState } from 'react';

interface StopInteractionState {
  readonly planKey: string | null;
  readonly expandedStops: Set<number>;
  readonly dismissedStopIds: Set<string>;
  readonly dismissingStopIds: Set<string>;
  readonly confirmingStopId: string | null;
  readonly revealedReasonStopIds: Set<string>;
  readonly undoStopId: string | null;
}

export interface PrecautionaryStopInteractions {
  readonly expandedStops: ReadonlySet<number>;
  readonly dismissedStopIds: ReadonlySet<string>;
  readonly dismissingStopIds: ReadonlySet<string>;
  readonly effectiveDismissedStopIds: ReadonlySet<string>;
  readonly confirmingStopId: string | null;
  readonly revealedReasonStopIds: ReadonlySet<string>;
  readonly undoStopId: string | null;
  readonly toggleExpanded: (index: number) => void;
  readonly toggleReason: (stopId: string) => void;
  readonly requestDismiss: (stopId: string) => void;
  readonly cancelDismiss: () => void;
  readonly confirmDismiss: (stopId: string) => void;
  readonly undoDismiss: (stopId: string) => void;
}

function createStopInteractionState(planKey: string | null): StopInteractionState {
  return {
    planKey,
    expandedStops: new Set(),
    dismissedStopIds: new Set(),
    dismissingStopIds: new Set(),
    confirmingStopId: null,
    revealedReasonStopIds: new Set(),
    undoStopId: null,
  };
}

export function usePrecautionaryStopInteractions(planKey: string | null): PrecautionaryStopInteractions {
  const [stopInteractionState, setStopInteractionState] = useState<StopInteractionState>(() =>
    createStopInteractionState(planKey),
  );
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const activeState = stopInteractionState.planKey === planKey
    ? stopInteractionState
    : createStopInteractionState(planKey);

  useEffect(() => {
    dismissTimerRefs.current.forEach(timer => clearTimeout(timer));
    dismissTimerRefs.current.clear();
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, [planKey]);

  useEffect(() => {
    return () => {
      dismissTimerRefs.current.forEach(timer => clearTimeout(timer));
      dismissTimerRefs.current.clear();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const updateStopInteractionState = (
    updater: (prev: StopInteractionState) => StopInteractionState,
  ) => {
    setStopInteractionState(prev => {
      const base = prev.planKey === planKey
        ? prev
        : createStopInteractionState(planKey);
      return updater(base);
    });
  };

  const showUndoForStop = (stopId: string) => {
    updateStopInteractionState(prev => ({ ...prev, undoStopId: stopId }));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      updateStopInteractionState(prev => ({
        ...prev,
        undoStopId: prev.undoStopId === stopId ? null : prev.undoStopId,
      }));
      undoTimerRef.current = null;
    }, 5_000);
  };

  const finishDismissStop = (stopId: string) => {
    updateStopInteractionState(prev => {
      const dismissingStopIdsNext = new Set(prev.dismissingStopIds);
      const dismissedStopIdsNext = new Set(prev.dismissedStopIds);
      dismissingStopIdsNext.delete(stopId);
      dismissedStopIdsNext.add(stopId);
      return {
        ...prev,
        dismissingStopIds: dismissingStopIdsNext,
        dismissedStopIds: dismissedStopIdsNext,
      };
    });
    dismissTimerRefs.current.delete(stopId);
    showUndoForStop(stopId);
  };

  const effectiveDismissedStopIds = useMemo(() => {
    const next = new Set(activeState.dismissedStopIds);
    activeState.dismissingStopIds.forEach(stopId => next.add(stopId));
    return next;
  }, [activeState.dismissedStopIds, activeState.dismissingStopIds]);

  return {
    expandedStops: activeState.expandedStops,
    dismissedStopIds: activeState.dismissedStopIds,
    dismissingStopIds: activeState.dismissingStopIds,
    effectiveDismissedStopIds,
    confirmingStopId: activeState.confirmingStopId,
    revealedReasonStopIds: activeState.revealedReasonStopIds,
    undoStopId: activeState.undoStopId,
    toggleExpanded: (index: number) => {
      updateStopInteractionState(prev => {
        const expandedStopsNext = new Set(prev.expandedStops);
        if (expandedStopsNext.has(index)) {
          expandedStopsNext.delete(index);
        } else {
          expandedStopsNext.add(index);
        }
        return { ...prev, expandedStops: expandedStopsNext };
      });
    },
    toggleReason: (stopId: string) => {
      updateStopInteractionState(prev => {
        const revealedReasonStopIdsNext = new Set(prev.revealedReasonStopIds);
        if (revealedReasonStopIdsNext.has(stopId)) {
          revealedReasonStopIdsNext.delete(stopId);
        } else {
          revealedReasonStopIdsNext.add(stopId);
        }
        return { ...prev, revealedReasonStopIds: revealedReasonStopIdsNext };
      });
    },
    requestDismiss: (stopId: string) => {
      updateStopInteractionState(prev => ({ ...prev, confirmingStopId: stopId }));
    },
    cancelDismiss: () => {
      updateStopInteractionState(prev => ({ ...prev, confirmingStopId: null }));
    },
    confirmDismiss: (stopId: string) => {
      updateStopInteractionState(prev => {
        const revealedReasonStopIdsNext = new Set(prev.revealedReasonStopIds);
        const dismissingStopIdsNext = new Set(prev.dismissingStopIds);
        revealedReasonStopIdsNext.delete(stopId);
        dismissingStopIdsNext.add(stopId);
        return {
          ...prev,
          confirmingStopId: null,
          revealedReasonStopIds: revealedReasonStopIdsNext,
          dismissingStopIds: dismissingStopIdsNext,
        };
      });

      if (dismissTimerRefs.current.has(stopId)) return;

      const prefersReducedMotion =
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        finishDismissStop(stopId);
        return;
      }

      const timer = setTimeout(() => finishDismissStop(stopId), 200);
      dismissTimerRefs.current.set(stopId, timer);
    },
    undoDismiss: (stopId: string) => {
      const dismissTimer = dismissTimerRefs.current.get(stopId);
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimerRefs.current.delete(stopId);
      }
      updateStopInteractionState(prev => {
        const dismissingStopIdsNext = new Set(prev.dismissingStopIds);
        const dismissedStopIdsNext = new Set(prev.dismissedStopIds);
        dismissingStopIdsNext.delete(stopId);
        dismissedStopIdsNext.delete(stopId);
        return {
          ...prev,
          dismissingStopIds: dismissingStopIdsNext,
          dismissedStopIds: dismissedStopIdsNext,
          undoStopId: null,
        };
      });
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    },
  };
}
