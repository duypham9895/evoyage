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
});
