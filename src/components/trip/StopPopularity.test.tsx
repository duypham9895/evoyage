// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StopPopularity from './StopPopularity';
import type { PopularityVerdict } from '@/types';

const I18N = {
  insufficient: 'Chưa đủ dữ liệu để dự đoán mức đông',
  formatBusy: (probability: number, dayOfWeek: number, hour: number, isHolidayBoosted: boolean) => {
    const day = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dayOfWeek];
    return `Thường đông ${day} ${hour}h (${Math.round(probability * 100)}% mẫu)${isHolidayBoosted ? ' · gần ngày lễ' : ''}`;
  },
  formatFree: (dayOfWeek: number, hour: number) => {
    const day = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dayOfWeek];
    return `Thường rảnh ${day} ${hour}h`;
  },
  reserveCta: 'Đặt trước qua V-GREEN →',
};

const STATION_VINFAST = { storeId: 'C.HCM0001', stationCode: 'vfc_HCM0001' };
const STATION_NON_VINFAST = { storeId: null, stationCode: null };

describe('StopPopularity', () => {
  it('renders the insufficient-data message when verdict.kind is insufficient-data', () => {
    const verdict: PopularityVerdict = { kind: 'insufficient-data' };
    render(<StopPopularity verdict={verdict} station={STATION_VINFAST} i18n={I18N} />);
    expect(screen.getByText('Chưa đủ dữ liệu để dự đoán mức đông')).toBeInTheDocument();
  });

  it('renders the busy label when probability ≥ 0.6', () => {
    const verdict: PopularityVerdict = {
      kind: 'ready',
      busyProbability: 0.78,
      sampleCount: 50,
      dayOfWeek: 5,
      hour: 17,
      isHolidayBoosted: false,
    };
    render(<StopPopularity verdict={verdict} station={STATION_VINFAST} i18n={I18N} />);
    expect(screen.getByText('Thường đông Thứ 6 17h (78% mẫu)')).toBeInTheDocument();
  });

  it('renders the free label when probability < 0.6', () => {
    const verdict: PopularityVerdict = {
      kind: 'ready',
      busyProbability: 0.3,
      sampleCount: 30,
      dayOfWeek: 2,
      hour: 14,
      isHolidayBoosted: false,
    };
    render(<StopPopularity verdict={verdict} station={STATION_VINFAST} i18n={I18N} />);
    expect(screen.getByText('Thường rảnh Thứ 3 14h')).toBeInTheDocument();
  });

  it('appends the holiday-boosted suffix when applicable', () => {
    const verdict: PopularityVerdict = {
      kind: 'ready',
      busyProbability: 0.85,
      sampleCount: 30,
      dayOfWeek: 4,
      hour: 17,
      isHolidayBoosted: true,
    };
    render(<StopPopularity verdict={verdict} station={STATION_VINFAST} i18n={I18N} />);
    expect(screen.getByText(/gần ngày lễ/)).toBeInTheDocument();
  });

  it('shows the reservation CTA when busy AND station has a storeId', () => {
    const verdict: PopularityVerdict = {
      kind: 'ready',
      busyProbability: 0.78,
      sampleCount: 50,
      dayOfWeek: 5,
      hour: 17,
      isHolidayBoosted: false,
    };
    render(<StopPopularity verdict={verdict} station={STATION_VINFAST} i18n={I18N} />);
    const cta = screen.getByText('Đặt trước qua V-GREEN →').closest('a') as HTMLAnchorElement;
    expect(cta).toBeInTheDocument();
    expect(cta.target).toBe('_blank');
    expect(cta.href).toContain('store_id=C.HCM0001');
  });

  it('hides the reservation CTA on a non-VinFast station even when busy', () => {
    const verdict: PopularityVerdict = {
      kind: 'ready',
      busyProbability: 0.78,
      sampleCount: 50,
      dayOfWeek: 5,
      hour: 17,
      isHolidayBoosted: false,
    };
    render(<StopPopularity verdict={verdict} station={STATION_NON_VINFAST} i18n={I18N} />);
    expect(screen.queryByText('Đặt trước qua V-GREEN →')).not.toBeInTheDocument();
  });

  it('hides the reservation CTA on a free verdict even at a VinFast station', () => {
    const verdict: PopularityVerdict = {
      kind: 'ready',
      busyProbability: 0.4,
      sampleCount: 50,
      dayOfWeek: 5,
      hour: 17,
      isHolidayBoosted: false,
    };
    render(<StopPopularity verdict={verdict} station={STATION_VINFAST} i18n={I18N} />);
    expect(screen.queryByText('Đặt trước qua V-GREEN →')).not.toBeInTheDocument();
  });

  it('returns null when verdict is undefined (typeguard for optional field)', () => {
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <StopPopularity verdict={undefined as any} station={STATION_VINFAST} i18n={I18N} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
