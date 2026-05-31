// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrecautionaryStopInteractions } from './usePrecautionaryStopInteractions';

afterEach(() => {
  vi.useRealTimers();
});

describe('usePrecautionaryStopInteractions', () => {
  it('hydrates dismissed station IDs for a saved trip plan', () => {
    const { result } = renderHook(() =>
      usePrecautionaryStopInteractions('trip-1', {
        initialDismissedStopIds: ['station-a', 'station-b'],
      }),
    );

    expect([...result.current.dismissedStopIds]).toEqual(['station-a', 'station-b']);
    expect([...result.current.effectiveDismissedStopIds]).toEqual(['station-a', 'station-b']);
  });

  it('resets hydrated dismissals when the plan key changes', () => {
    const { result, rerender } = renderHook(
      ({ planKey, initialDismissedStopIds }: {
        readonly planKey: string;
        readonly initialDismissedStopIds: readonly string[];
      }) => usePrecautionaryStopInteractions(planKey, { initialDismissedStopIds }),
      {
        initialProps: {
          planKey: 'trip-1',
          initialDismissedStopIds: ['station-a'],
        },
      },
    );

    expect([...result.current.dismissedStopIds]).toEqual(['station-a']);

    rerender({
      planKey: 'trip-2',
      initialDismissedStopIds: ['station-c'],
    });

    expect([...result.current.dismissedStopIds]).toEqual(['station-c']);
  });

  it('undo removes a hydrated dismissal from the active plan', () => {
    const { result } = renderHook(() =>
      usePrecautionaryStopInteractions('trip-1', {
        initialDismissedStopIds: ['station-a'],
      }),
    );

    act(() => {
      result.current.undoDismiss('station-a');
    });

    expect([...result.current.dismissedStopIds]).toEqual([]);
    expect([...result.current.effectiveDismissedStopIds]).toEqual([]);
  });
});
