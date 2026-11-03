// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useState } from 'react';
import AddCustomVehicle from '@/components/trip/AddCustomVehicle';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

const mockLocaleState = { current: 'vi' as 'vi' | 'en' };
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocaleState.current,
    toggleLocale: () => {},
    t: (key: string, params?: Record<string, string | number>) => {
      const raw = (dicts[mockLocaleState.current] as Record<string, string>)[key] ?? key;
      if (!params) return raw;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        raw,
      );
    },
    tBi: (obj: { messageVi: string; messageEn: string }) =>
      mockLocaleState.current === 'vi' ? obj.messageVi : obj.messageEn,
  }),
}));

// A wrapper that reproduces the real app's shape: a trigger button inside a
// "sheet" container, with the modal rendered as a sibling outside it — the
// same relationship AddCustomVehicle has to MobileBottomSheet in plan/page.tsx.
function Harness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <div data-testid="sheet-container">
        <button data-testid="trigger" onClick={() => setIsOpen(true)}>
          open
        </button>
      </div>
      <AddCustomVehicle isOpen={isOpen} onClose={() => setIsOpen(false)} onSave={() => {}} />
    </div>
  );
}

describe('AddCustomVehicle — accessible dialog (design-system-research-2026-11-01.md §D7)', () => {
  beforeEach(() => {
    mockLocaleState.current = 'vi';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('portals the dialog content outside the sheet container it is triggered from', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));

    const sheet = screen.getByTestId('sheet-container');
    const dialog = screen.getByRole('dialog');

    expect(sheet.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('exposes role=dialog, aria-modal=true and an accessible name', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));

    const dialog = screen.getByRole('dialog', { name: vi_dict.add_vehicle });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves focus into the dialog on open and returns it to the trigger on close', async () => {
    render(<Harness />);
    const trigger = screen.getByTestId('trigger');
    // fireEvent.click does not move focus the way a real browser click on a
    // <button> does, so focus it explicitly to set up the precondition that
    // final-focus restoration is actually testing (returning to what was
    // focused before the dialog opened).
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps existing behaviour: filling the form and submitting calls onSave with parsed values, then closes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<AddCustomVehicle isOpen onClose={onClose} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText('Tesla, Hyundai, Mercedes...'), {
      target: { value: 'Tesla' },
    });
    fireEvent.change(screen.getByPlaceholderText('Model 3 Long Range, Ioniq 5...'), {
      target: { value: 'Model 3' },
    });
    fireEvent.change(screen.getByPlaceholderText('60, 75, 82.5...'), { target: { value: '60' } });
    fireEvent.change(screen.getByPlaceholderText('400, 500, 600...'), { target: { value: '400' } });

    fireEvent.click(screen.getByRole('button', { name: vi_dict.save }));

    expect(onSave).toHaveBeenCalledWith({
      brand: 'Tesla',
      model: 'Model 3',
      batteryCapacityKwh: 60,
      officialRangeKm: 400,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps existing behaviour: does not render anything when isOpen is false', () => {
    render(<AddCustomVehicle isOpen={false} onClose={() => {}} onSave={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps existing behaviour: the cancel button calls onClose without saving', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<AddCustomVehicle isOpen onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: vi_dict.cancel }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
