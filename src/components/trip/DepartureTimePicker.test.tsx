// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import DepartureTimePicker from './DepartureTimePicker';

const I18N = {
  label: 'Khởi hành',
  resetButton: 'Đi ngay',
  helperFuture: '(trong vòng 7 ngày)',
};

describe('DepartureTimePicker', () => {
  it('renders empty input when value is null (default "now" mode)', () => {
    render(<DepartureTimePicker value={null} onChange={() => {}} i18n={I18N} />);
    const input = screen.getByLabelText('Khởi hành') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('does not show reset button in "now" mode', () => {
    render(<DepartureTimePicker value={null} onChange={() => {}} i18n={I18N} />);
    expect(screen.queryByText('Đi ngay')).not.toBeInTheDocument();
  });

  it('shows reset button when a future time is selected', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    render(<DepartureTimePicker value={future} onChange={() => {}} i18n={I18N} />);
    expect(screen.getByText('Đi ngay')).toBeInTheDocument();
  });

  it('emits ISO 8601 when user picks a date/time', () => {
    const onChange = vi.fn();
    render(<DepartureTimePicker value={null} onChange={onChange} i18n={I18N} />);
    const input = screen.getByLabelText('Khởi hành') as HTMLInputElement;

    // Simulate the browser datetime-local picker emitting "2026-05-04T08:00"
    fireEvent.change(input, { target: { value: '2026-05-04T08:00' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0]![0] as string;
    // Verify it's a valid ISO string parsable back to the same wall clock
    expect(new Date(emitted).getFullYear()).toBe(2026);
    expect(new Date(emitted).getMonth()).toBe(4); // May = month 4
    expect(new Date(emitted).getDate()).toBe(4);
  });

  it('emits null when user clicks reset button', () => {
    const onChange = vi.fn();
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    render(<DepartureTimePicker value={future} onChange={onChange} i18n={I18N} />);

    fireEvent.click(screen.getByText('Đi ngay'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('emits null when user clears the input manually', () => {
    const onChange = vi.fn();
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    render(<DepartureTimePicker value={future} onChange={onChange} i18n={I18N} />);
    const input = screen.getByLabelText('Khởi hành') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('sets a min attribute that prevents picking past dates', () => {
    render(<DepartureTimePicker value={null} onChange={() => {}} i18n={I18N} />);
    const input = screen.getByLabelText('Khởi hành') as HTMLInputElement;
    const min = input.min;
    // min should be parseable as a date and not be more than ~1 minute in the past
    const minMs = new Date(min).getTime();
    expect(minMs).toBeGreaterThan(Date.now() - 60_000);
  });

  it('sets a max attribute capped at 7 days out (Mapbox horizon)', () => {
    render(<DepartureTimePicker value={null} onChange={() => {}} i18n={I18N} />);
    const input = screen.getByLabelText('Khởi hành') as HTMLInputElement;
    const maxMs = new Date(input.max).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // max should be within ~7 days +/- 1 day buffer for slop in test timing
    expect(maxMs).toBeGreaterThan(Date.now() + sevenDaysMs - 24 * 60 * 60 * 1000);
    expect(maxMs).toBeLessThan(Date.now() + sevenDaysMs + 24 * 60 * 60 * 1000);
  });

  it('renders the helper hint text from i18n', () => {
    render(<DepartureTimePicker value={null} onChange={() => {}} i18n={I18N} />);
    expect(screen.getByText('(trong vòng 7 ngày)')).toBeInTheDocument();
  });

  it('hydrates the input from an ISO 8601 value', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    future.setHours(8, 30, 0, 0);
    render(
      <DepartureTimePicker value={future.toISOString()} onChange={() => {}} i18n={I18N} />,
    );
    const input = screen.getByLabelText('Khởi hành') as HTMLInputElement;
    // Format: YYYY-MM-DDTHH:mm in local time
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T08:30$/);
  });
});
