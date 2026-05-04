// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import TripNotebook from './TripNotebook';
import { createNotebookStore, type SavedTripInput } from '@/lib/trip/notebook-store';

const I18N = {
  heading: 'Chuyến đi đã lưu',
  empty: 'Bạn chưa lưu chuyến đi nào — kế hoạch xong sẽ tự lưu vào đây',
  replan: 'Mở lại',
  pin: 'Ghim',
  unpin: 'Bỏ ghim',
  remove: 'Xoá',
  vehicleMissing: 'Xe không còn trong eVoyage',
  savedAgo: 'Lưu cách đây {{when}}',
  formatRelative: (iso: string) => `${Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)} phút`,
};

const SAMPLE: SavedTripInput = {
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
};

describe('TripNotebook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows empty state when store has no entries', () => {
    const store = createNotebookStore();
    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );
    expect(screen.getByText(I18N.empty)).toBeInTheDocument();
  });

  it('renders one entry per saved trip', () => {
    const store = createNotebookStore();
    store.save({ ...SAMPLE, end: 'Đà Lạt' });
    store.save({ ...SAMPLE, end: 'Vũng Tàu' });
    store.save({ ...SAMPLE, end: 'Nha Trang' });

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );

    expect(screen.getAllByText(/Đà Lạt|Vũng Tàu|Nha Trang/)).toHaveLength(3);
  });

  it('puts pinned entries above unpinned', () => {
    const store = createNotebookStore();
    const a = store.save({ ...SAMPLE, end: 'Vũng Tàu' });
    store.save({ ...SAMPLE, end: 'Nha Trang' });
    store.pin(a.id, true);

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );

    const allText = document.body.textContent ?? '';
    const vungTauIdx = allText.indexOf('Vũng Tàu');
    const nhaTrangIdx = allText.indexOf('Nha Trang');
    expect(vungTauIdx).toBeLessThan(nhaTrangIdx);
  });

  it('passes resolved vehicle name into each entry', () => {
    const store = createNotebookStore();
    store.save({ ...SAMPLE, vehicleId: 'vf-8' });
    store.save({ ...SAMPLE, vehicleId: 'vf-9', end: 'Vũng Tàu' });

    const resolveVehicleName = vi.fn((id: string | null) =>
      id === 'vf-8' ? 'VinFast VF 8' : id === 'vf-9' ? 'VinFast VF 9' : null,
    );

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={resolveVehicleName}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );

    expect(screen.getByText('VinFast VF 8')).toBeInTheDocument();
    expect(screen.getByText('VinFast VF 9')).toBeInTheDocument();
  });

  it('bubbles onReplan up when an entry "Mở lại" is clicked', () => {
    const store = createNotebookStore();
    store.save(SAMPLE);
    const onReplan = vi.fn();

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={onReplan}
        i18n={I18N}
      />,
    );

    fireEvent.click(screen.getByText('Mở lại'));
    expect(onReplan).toHaveBeenCalledTimes(1);
  });

  it('toggles pin via store + re-renders the entry', () => {
    const store = createNotebookStore();
    store.save(SAMPLE);

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );

    expect(screen.getByText('Ghim')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ghim'));
    expect(screen.getByText('Bỏ ghim')).toBeInTheDocument();
    expect(store.list()[0]?.pinned).toBe(true);
  });

  it('removes entry via store + re-renders the list', () => {
    const store = createNotebookStore();
    store.save(SAMPLE);
    expect(store.list()).toHaveLength(1);

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );

    fireEvent.click(screen.getByText('Xoá'));
    expect(store.list()).toHaveLength(0);
    expect(screen.getByText(I18N.empty)).toBeInTheDocument();
  });

  it('renders the heading when entries are present', () => {
    const store = createNotebookStore();
    store.save(SAMPLE);

    render(
      <TripNotebook
        store={store}
        resolveVehicleName={() => 'VinFast VF 8'}
        onReplan={() => {}}
        i18n={I18N}
      />,
    );

    expect(screen.getByText(I18N.heading)).toBeInTheDocument();
  });
});
