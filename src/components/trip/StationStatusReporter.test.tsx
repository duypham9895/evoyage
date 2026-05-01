// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StationStatusReporter from './StationStatusReporter';

// ── Locale mock ──

const translations: Record<string, string> = {
  station_report_section_title: 'Is this charger up to date?',
  station_report_working: 'Báo trạm hoạt động',
  station_report_broken: 'Báo lỗi',
  station_report_busy: 'Báo đang bận',
  station_report_thanks: 'Cảm ơn bạn đã báo',
  station_report_failed: 'Không gửi được báo cáo. Thử lại nhé.',
  station_report_rate_limited: 'Chậm lại một chút rồi thử lại nhé.',
  station_report_last_verified: 'Xác nhận lần cuối: {{minutes}} phút trước',
  station_report_last_verified_just_now: 'Xác nhận lần cuối: vừa xong',
};

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'vi',
    t: (key: string, params?: Record<string, string | number>) => {
      let text = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{{${k}}}`, String(v));
        }
      }
      return text;
    },
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

// ── Helpers ──

const STATION_ID = 'clxabcdef0123456789abcde';

function mockFetchOnce(response: { ok: boolean; status?: number }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 201 : 500),
    json: async () => ({ success: response.ok }),
  }) as unknown as typeof fetch;
}

// ── Tests ──

describe('StationStatusReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the section title and three text buttons (no icons)', () => {
    render(<StationStatusReporter stationId={STATION_ID} />);
    expect(screen.getByText('Is this charger up to date?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Báo trạm hoạt động' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Báo lỗi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Báo đang bận' })).toBeInTheDocument();

    // Buttons must contain only text — no svg/img children (DESIGN.md)
    const reporter = screen.getByTestId('station-status-reporter');
    expect(reporter.querySelectorAll('svg')).toHaveLength(0);
    expect(reporter.querySelectorAll('img')).toHaveLength(0);
  });

  it('does not render last-verified row when lastVerifiedAt is null', () => {
    render(<StationStatusReporter stationId={STATION_ID} lastVerifiedAt={null} />);
    expect(screen.queryByText(/Xác nhận lần cuối/)).not.toBeInTheDocument();
  });

  it('renders "just now" when verified less than a minute ago', () => {
    const now = new Date();
    render(<StationStatusReporter stationId={STATION_ID} lastVerifiedAt={now} />);
    expect(screen.getByText('Xác nhận lần cuối: vừa xong')).toBeInTheDocument();
  });

  it('renders minutes-ago format when verified earlier', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    render(<StationStatusReporter stationId={STATION_ID} lastVerifiedAt={fiveMinAgo} />);
    expect(screen.getByText(/Xác nhận lần cuối: 5 phút trước/)).toBeInTheDocument();
  });

  it('accepts ISO string for lastVerifiedAt', () => {
    const iso = new Date(Date.now() - 10 * 60_000).toISOString();
    render(<StationStatusReporter stationId={STATION_ID} lastVerifiedAt={iso} />);
    expect(screen.getByText(/Xác nhận lần cuối: 10 phút trước/)).toBeInTheDocument();
  });

  it('hides last-verified row for invalid date strings', () => {
    render(<StationStatusReporter stationId={STATION_ID} lastVerifiedAt="not-a-date" />);
    expect(screen.queryByText(/Xác nhận lần cuối/)).not.toBeInTheDocument();
  });

  it('POSTs to the status-report endpoint with the chosen status', async () => {
    mockFetchOnce({ ok: true, status: 201 });
    render(<StationStatusReporter stationId={STATION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Báo lỗi' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`/api/stations/${STATION_ID}/status-report`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ status: 'BROKEN' });

    expect(await screen.findByText('Cảm ơn bạn đã báo')).toBeInTheDocument();
  });

  it('shows rate-limit message on 429', async () => {
    mockFetchOnce({ ok: false, status: 429 });
    render(<StationStatusReporter stationId={STATION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Báo trạm hoạt động' }));

    expect(await screen.findByText('Chậm lại một chút rồi thử lại nhé.')).toBeInTheDocument();
  });

  it('shows error message on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    render(<StationStatusReporter stationId={STATION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Báo đang bận' }));

    expect(await screen.findByText('Không gửi được báo cáo. Thử lại nhé.')).toBeInTheDocument();
  });

  it('disables all buttons while a report is in-flight', async () => {
    let resolveFetch: (v: { ok: boolean; status: number; json: () => Promise<unknown> }) => void = () => {};
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    ) as unknown as typeof fetch;

    render(<StationStatusReporter stationId={STATION_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo trạm hoạt động' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Báo trạm hoạt động' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Báo lỗi' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Báo đang bận' })).toBeDisabled();
    });

    resolveFetch({ ok: true, status: 201, json: async () => ({ success: true }) });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Báo lỗi' })).not.toBeDisabled();
    });
  });
});
