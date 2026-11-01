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

  it('cancels an in-flight dismiss timer when planKey changes', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ planKey }: { readonly planKey: string }) => usePrecautionaryStopInteractions(planKey),
      { initialProps: { planKey: 'trip-1' } },
    );

    act(() => {
      result.current.confirmDismiss('s1');
    });
    expect([...result.current.dismissingStopIds]).toEqual(['s1']);

    rerender({ planKey: 'trip-2' });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect([...result.current.dismissedStopIds]).not.toContain('s1');
    expect([...result.current.dismissingStopIds]).not.toContain('s1');

    vi.restoreAllMocks();
  });

  it('keeps dismissedStopIds identity stable across rerenders with the same planKey', () => {
    const { result, rerender } = renderHook(
      ({ planKey }: { readonly planKey: string }) =>
        usePrecautionaryStopInteractions(planKey, {
          initialDismissedStopIds: ['station-a'],
        }),
      { initialProps: { planKey: 'trip-1' } },
    );

    const firstDismissedStopIds = result.current.dismissedStopIds;

    rerender({ planKey: 'trip-1' });

    expect(result.current.dismissedStopIds).toBe(firstDismissedStopIds);
  });
});
