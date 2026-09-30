// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MobileBottomSheet from './MobileBottomSheet';

const VIEWPORT_HEIGHT = 768; // jsdom default
const HALF_HEIGHT = (VIEWPORT_HEIGHT * 55) / 100;
const FULL_HEIGHT = (VIEWPORT_HEIGHT * 92) / 100;
const PEEK_HEIGHT = 120;

function heightPx(): number {
  return parseFloat(screen.getByTestId('bottom-sheet').style.height);
}

/** Drag the handle by `deltaY` px (negative = upward) without releasing. */
function dragBy(deltaY: number): void {
  const handle = screen.getByTestId('sheet-handle');
  fireEvent.mouseDown(handle, { clientY: 400 });
  fireEvent.mouseMove(window, { clientY: 400 + deltaY });
}

describe('MobileBottomSheet', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders at the half snap point by default', () => {
    render(<MobileBottomSheet>content</MobileBottomSheet>);

    expect(heightPx()).toBeCloseTo(HALF_HEIGHT, 1);
  });

  it('follows the pointer while dragging up from the current snap point', () => {
    render(<MobileBottomSheet>content</MobileBottomSheet>);

    dragBy(-100);

    expect(heightPx()).toBeCloseTo(HALF_HEIGHT + 100, 1);
  });

  it('follows the pointer while dragging down from the current snap point', () => {
    render(<MobileBottomSheet>content</MobileBottomSheet>);

    dragBy(80);

    expect(heightPx()).toBeCloseTo(HALF_HEIGHT - 80, 1);
  });

  it('measures the drag from the snap point it started at, not the initial one', () => {
    render(<MobileBottomSheet initialSnap="peek">content</MobileBottomSheet>);

    expect(heightPx()).toBeCloseTo(PEEK_HEIGHT, 1);

    dragBy(-60);

    expect(heightPx()).toBeCloseTo(PEEK_HEIGHT + 60, 1);
  });

  it('snaps to the nearest point on release', () => {
    render(<MobileBottomSheet>content</MobileBottomSheet>);

    // Drag most of the way to full, then let go.
    dragBy(-(FULL_HEIGHT - HALF_HEIGHT) + 30);
    fireEvent.mouseUp(window);

    expect(heightPx()).toBeCloseTo(FULL_HEIGHT, 1);
  });

  it('snaps back down to peek when dragged far enough', () => {
    render(<MobileBottomSheet>content</MobileBottomSheet>);

    dragBy(HALF_HEIGHT - PEEK_HEIGHT - 30);
    fireEvent.mouseUp(window);

    expect(heightPx()).toBeCloseTo(PEEK_HEIGHT, 1);
  });

  it('ignores an absent snapTo and keeps the initial snap point', () => {
    render(<MobileBottomSheet initialSnap="peek">content</MobileBottomSheet>);

    expect(heightPx()).toBeCloseTo(PEEK_HEIGHT, 1);
  });

  it('applies a snapTo supplied by the parent', () => {
    const { rerender } = render(
      <MobileBottomSheet initialSnap="peek">content</MobileBottomSheet>,
    );

    rerender(
      <MobileBottomSheet initialSnap="peek" snapTo={{ point: 'full', trigger: 1 }}>
        content
      </MobileBottomSheet>,
    );

    expect(heightPx()).toBeCloseTo(FULL_HEIGHT, 1);
  });

  it('re-snaps to the same point when the trigger increments', () => {
    const { rerender } = render(
      <MobileBottomSheet snapTo={{ point: 'full', trigger: 1 }}>content</MobileBottomSheet>,
    );
    expect(heightPx()).toBeCloseTo(FULL_HEIGHT, 1);

    // User drags away from the parent-requested point...
    dragBy(FULL_HEIGHT - HALF_HEIGHT);
    fireEvent.mouseUp(window);
    expect(heightPx()).toBeCloseTo(HALF_HEIGHT, 1);

    // ...and the parent asks for 'full' again with a fresh trigger.
    rerender(
      <MobileBottomSheet snapTo={{ point: 'full', trigger: 2 }}>content</MobileBottomSheet>,
    );

    expect(heightPx()).toBeCloseTo(FULL_HEIGHT, 1);
  });

  it('does not re-snap while the trigger is unchanged', () => {
    const snapTo = { point: 'full', trigger: 1 } as const;
    const { rerender } = render(
      <MobileBottomSheet snapTo={snapTo}>content</MobileBottomSheet>,
    );

    dragBy(FULL_HEIGHT - HALF_HEIGHT);
    fireEvent.mouseUp(window);
    expect(heightPx()).toBeCloseTo(HALF_HEIGHT, 1);

    rerender(<MobileBottomSheet snapTo={snapTo}>other content</MobileBottomSheet>);

    expect(heightPx()).toBeCloseTo(HALF_HEIGHT, 1);
  });

  it('disables the height transition only while dragging', () => {
    render(<MobileBottomSheet>content</MobileBottomSheet>);
    const sheet = screen.getByTestId('bottom-sheet');

    expect(sheet.style.transition).not.toBe('none');

    dragBy(-50);
    expect(sheet.style.transition).toBe('none');

    fireEvent.mouseUp(window);
    expect(sheet.style.transition).not.toBe('none');
  });
});
