// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanPage from './page';

/**
 * Regression net for P05-fab-cover: on mobile, the floating buttons
 * (feedback, eVi) are pinned just above the bottom sheet's half snap
 * (`bottom-[calc(55vh+...)]`). When the sheet is at the full snap — which
 * planning a trip forces — they float over the sheet's content, including
 * the primary button. They must hide at full and come back at half.
 */

const VIEWPORT_HEIGHT = 768; // jsdom default
const HALF_HEIGHT = (VIEWPORT_HEIGHT * 55) / 100;
const FULL_HEIGHT = (VIEWPORT_HEIGHT * 92) / 100;

beforeEach(() => {
  // Mobile viewport: useIsMobile reads matchMedia.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/plan');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ vehicles: [] }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function dragSheetBy(deltaY: number): void {
  const handle = screen.getByTestId('sheet-handle');
  fireEvent.mouseDown(handle, { clientY: 400 });
  fireEvent.mouseMove(window, { clientY: 400 + deltaY });
  fireEvent.mouseUp(window);
}

describe('plan page (mobile) — floating buttons vs bottom sheet snap', () => {
  it('shows the feedback and eVi buttons at half, hides them at full, and restores them back at half', async () => {
    render(<PlanPage />);

    // Half snap (initial): both floating buttons are reachable.
    expect(await screen.findByRole('button', { name: 'Mở trợ lý eVi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi góp ý' })).toBeInTheDocument();

    // Full snap: they would cover the sheet content, so they are hidden.
    dragSheetBy(-(FULL_HEIGHT - HALF_HEIGHT));
    expect(screen.queryByRole('button', { name: 'Mở trợ lý eVi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gửi góp ý' })).toBeNull();

    // Back to half: visible again.
    dragSheetBy(FULL_HEIGHT - HALF_HEIGHT);
    expect(screen.getByRole('button', { name: 'Mở trợ lý eVi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi góp ý' })).toBeInTheDocument();
  }, 20000);
});
