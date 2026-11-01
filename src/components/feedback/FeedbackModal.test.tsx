// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FeedbackModal from './FeedbackModal';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe('FeedbackModal — characterization (react-hooks compiler refactor)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts on the category step when no stationContext is given', () => {
    render(<FeedbackModal isOpen={true} onClose={() => {}} />);

    expect(screen.getByText('feedback_category_prompt')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('feedback_ph_general')).not.toBeInTheDocument();
  });

  it('lands on the form with STATION_DATA_ERROR when stationContext is given', async () => {
    render(
      <FeedbackModal
        isOpen={true}
        onClose={() => {}}
        stationContext={{ stationId: 's1', stationName: 'Station One' }}
      />,
    );

    // findBy* passes whether the step is set during the initial render or
    // lands one render later via an effect.
    expect(await screen.findByText('feedback_cat_station_data_error')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('feedback_ph_station')).toBeInTheDocument();
  });

  it('prefills email from localStorage evoyage-feedback-email', async () => {
    localStorage.setItem('evoyage-feedback-email', 'saved@example.com');

    render(
      <FeedbackModal
        isOpen={true}
        onClose={() => {}}
        stationContext={{ stationId: 's1', stationName: 'Station One' }}
      />,
    );

    expect(await screen.findByDisplayValue('saved@example.com')).toBeInTheDocument();
  });

  it('submits a numeric formOpenedAt stamped no later than submit time', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <FeedbackModal
        isOpen={true}
        onClose={() => {}}
        stationContext={{ stationId: 's1', stationName: 'Station One' }}
      />,
    );

    const description = await screen.findByPlaceholderText('feedback_ph_station');
    fireEvent.change(description, {
      target: { value: 'This description is definitely long enough.' },
    });

    const submitButton = screen.getByRole('button', { name: 'feedback_submit' });
    const beforeSubmit = Date.now();
    fireEvent.click(submitButton);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string) as { formOpenedAt: unknown };

    expect(typeof body.formOpenedAt).toBe('number');
    expect(body.formOpenedAt as number).toBeGreaterThan(0);
    expect(body.formOpenedAt as number).toBeLessThanOrEqual(beforeSubmit + 1);
  });
  // BUG(p2-feedback-form-failures): a decimal-comma coordinate ('10,7626') is sent as Number() -> NaN -> JSON null, which the API rejects. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-feedback-form-failures.md
  it.fails('normalises decimal-comma coordinates for MISSING_STATION instead of sending null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<FeedbackModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText('feedback_cat_missing_station'));

    fireEvent.change(await screen.findByPlaceholderText('feedback_ph_missing_station'), {
      target: { value: 'A new charging station near District 1.' },
    });
    fireEvent.change(screen.getByLabelText('feedback_field_proposed_lat'), { target: { value: '10,7626' } });
    fireEvent.change(screen.getByLabelText('feedback_field_proposed_lng'), { target: { value: '106,6602' } });
    fireEvent.click(screen.getByRole('button', { name: 'feedback_submit' }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.proposedLatitude).toBe(10.7626);
    expect(body.proposedLongitude).toBe(106.6602);
  });

  // BUG(p2-feedback-form-failures): a 400 whose details name a field the form does not render (e.g. proposedLatitude) is swallowed silently. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-feedback-form-failures.md
  it.fails('shows a visible error when the server rejects a field the form does not render', async () => {
    const jsonMock = vi.fn().mockResolvedValue({
      success: false,
      error: 'Dữ liệu không hợp lệ',
      details: [{ path: ['proposedLatitude'], message: 'Invalid input: expected number, received null' }],
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: jsonMock });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<FeedbackModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText('feedback_cat_missing_station'));
    fireEvent.change(await screen.findByPlaceholderText('feedback_ph_missing_station'), {
      target: { value: 'A new charging station near District 1.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'feedback_submit' }));

    // Wait until the submit round-trip has fully settled (button label back from 'feedback_submitting').
    await vi.waitFor(() => expect(jsonMock).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'feedback_submit' });

    const errorStepShown = screen.queryByText('feedback_error_message') !== null;
    const detailShown = screen.queryByText(/expected number, received null/) !== null;
    expect(errorStepShown || detailShown).toBe(true);
  });
});
