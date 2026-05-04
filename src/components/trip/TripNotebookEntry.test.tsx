// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import TripNotebookEntry from './TripNotebookEntry';
import type { SavedTrip } from '@/lib/trip/notebook-store';

const I18N = {
  replan: 'Mở lại',
  pin: 'Ghim',
  unpin: 'Bỏ ghim',
  remove: 'Xoá',
  vehicleMissing: 'Xe không còn trong eVoyage',
  savedAgo: 'Lưu cách đây {{when}}',
  formatRelative: (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ`;
    return `${Math.floor(hrs / 24)} ngày`;
  },
};

function makeTrip(overrides: Partial<SavedTrip> = {}): SavedTrip {
  return {
    id: 't-1',
    savedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastViewedAt: new Date().toISOString(),
    pinned: false,
    start: 'Quận 1, TP.HCM',
    end: 'Đà Lạt',
    waypoints: [],
    isLoopTrip: false,
    vehicleId: 'vf-8',
    customVehicle: null,
    currentBattery: 80,
    minArrival: 15,
    rangeSafetyFactor: 0.8,
    departAt: null,
    ...overrides,
  };
}

describe('TripNotebookEntry', () => {
  it('renders the city pair via extractCityName', () => {
    render(
      <TripNotebookEntry
        trip={makeTrip()}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    expect(screen.getByText(/TP\.HCM/)).toBeInTheDocument();
    expect(screen.getByText(/Đà Lạt/)).toBeInTheDocument();
  });

  it('renders the vehicle name when supplied', () => {
    render(
      <TripNotebookEntry
        trip={makeTrip()}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    expect(screen.getByText('VinFast VF 8')).toBeInTheDocument();
  });

  it('renders "Xe không còn..." when vehicle name is missing', () => {
    render(
      <TripNotebookEntry
        trip={makeTrip()}
        vehicleName={null}
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    expect(screen.getByText('Xe không còn trong eVoyage')).toBeInTheDocument();
  });

  it('shows "Ghim" label when not pinned and "Bỏ ghim" when pinned', () => {
    const { rerender } = render(
      <TripNotebookEntry
        trip={makeTrip({ pinned: false })}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    expect(screen.getByText('Ghim')).toBeInTheDocument();

    rerender(
      <TripNotebookEntry
        trip={makeTrip({ pinned: true })}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    expect(screen.getByText('Bỏ ghim')).toBeInTheDocument();
  });

  it('invokes onReplan with the trip on "Mở lại" click', () => {
    const onReplan = vi.fn();
    const trip = makeTrip();
    render(
      <TripNotebookEntry
        trip={trip}
        vehicleName="VinFast VF 8"
        onReplan={onReplan}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    fireEvent.click(screen.getByText('Mở lại'));
    expect(onReplan).toHaveBeenCalledWith(trip);
  });

  it('invokes onPin with the inverted boolean', () => {
    const onPin = vi.fn();
    render(
      <TripNotebookEntry
        trip={makeTrip({ pinned: false })}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={onPin}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    fireEvent.click(screen.getByText('Ghim'));
    expect(onPin).toHaveBeenCalledWith('t-1', true);
  });

  it('invokes onDelete with the trip id on "Xoá" click', () => {
    const onDelete = vi.fn();
    render(
      <TripNotebookEntry
        trip={makeTrip()}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={onDelete}
        i18n={I18N}
      />,
    );
    fireEvent.click(screen.getByText('Xoá'));
    expect(onDelete).toHaveBeenCalledWith('t-1');
  });

  it('renders relative-time label from i18n.formatRelative', () => {
    render(
      <TripNotebookEntry
        trip={makeTrip({ savedAt: new Date(Date.now() - 5 * 60_000).toISOString() })}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    // Should match the savedAgo template with "5 phút" interpolated
    expect(screen.getByText(/5 phút/)).toBeInTheDocument();
  });

  it('applies a pinned visual state via data-pinned attribute', () => {
    const { container } = render(
      <TripNotebookEntry
        trip={makeTrip({ pinned: true })}
        vehicleName="VinFast VF 8"
        onReplan={() => {}}
        onPin={() => {}}
        onDelete={() => {}}
        i18n={I18N}
      />,
    );
    expect(container.querySelector('[data-pinned="true"]')).toBeInTheDocument();
  });
});
