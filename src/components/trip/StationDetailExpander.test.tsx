// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StationDetailExpander from './StationDetailExpander';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({ t: (key: string) => key, locale: 'en' }),
}));

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('StationDetailExpander — SSE stream handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the error + retry cooldown when the server sends an error event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(['data: {"stage":"error","code":"INTERNAL_ERROR"}\n\n']),
    );
    render(<StationDetailExpander stationId="cmolmt0xkii77gjoh" stationProvider="VinFast" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('station_detail_temp_unavailable')).toBeInTheDocument();
    });
    expect(screen.getByText('station_detail_retry_after')).toBeInTheDocument();
  });

  // BUG(p0-vinfast-detail-invalid-id): stream that closes without a done/error event leaves the expander loading forever. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p0-vinfast-detail-invalid-id.md
  it.fails('leaves the loading state with an error when the stream ends without a terminal event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(['data: {"stage":"fetching"}\n\n']),
    );
    render(<StationDetailExpander stationId="cmolmt0xkii77gjoh" stationProvider="VinFast" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('station_detail_temp_unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('button')).not.toHaveTextContent('station_detail_loading');
  });
});
