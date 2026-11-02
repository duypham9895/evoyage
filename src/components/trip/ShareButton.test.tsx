// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import en from '@/locales/en.json';
import ShareButton from './ShareButton';
import type { TripPlan } from '@/types';

const messages = en as Record<string, string>;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) => messages[key] ?? key,
    locale: 'en',
  }),
}));

vi.mock('@/lib/analytics', () => ({ trackShareClicked: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,') } }));
vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

const TRIP_PLAN = {
  tripId: 'trip-1',
  startAddress: 'Ho Chi Minh City',
  endAddress: 'Vung Tau',
  startCoord: { lat: 10.7769, lng: 106.7009 },
  endCoord: { lat: 10.346, lng: 107.0843 },
  polyline: 'poly',
  totalDistanceKm: 95,
  totalDurationMin: 120,
  chargingStops: [],
  warnings: [],
  batterySegments: [],
  arrivalBatteryPercent: 60,
  totalChargingTimeMin: 0,
} as unknown as TripPlan;

const SHARED_PATH = '/plan?start=Ho%20Chi%20Minh&end=Vung%20Tau&vid=veh-1';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.history.replaceState(null, '', SHARED_PATH);
  // Short-link creation fails (server error) so the fallback path runs.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
  writeText = vi.fn();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openModalAndCopy() {
  render(<ShareButton tripPlan={TRIP_PLAN} />);
  fireEvent.click(screen.getAllByRole('button', { name: messages.share_button })[0]);
  fireEvent.click(await screen.findByRole('button', { name: messages.share_copy_link }));
}

describe('ShareButton — copy link fallback', () => {
  it('copies the full URL and says so when short-link creation fails but the fallback copy succeeds', async () => {
    writeText.mockResolvedValue(undefined);

    await openModalAndCopy();

    expect(await screen.findByText(messages.share_link_error)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  // BUG(p2-sharing-flow): when the fallback clipboard write also fails, the UI still says "The full URL has been copied instead". See docs/bugs/2026-11-01-p2-sharing-flow.md
  it('does not claim the full URL was copied when the fallback clipboard write also fails', async () => {
    writeText.mockRejectedValue(new DOMException('Document is not focused', 'NotAllowedError'));

    await openModalAndCopy();

    // Wait until the fallback attempt has run and the handler has settled.
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: messages.share_copy_link })).not.toBeDisabled(),
    );

    expect(screen.queryByText(/has been copied/i)).not.toBeInTheDocument();
  });

  it('says the copy failed and shows the full URL for manual copy when the fallback clipboard write also fails', async () => {
    writeText.mockRejectedValue(new DOMException('Document is not focused', 'NotAllowedError'));

    await openModalAndCopy();

    expect(
      await screen.findByText(`${messages.share_copy_failed} ${window.location.href}`),
    ).toBeInTheDocument();
  });
});
