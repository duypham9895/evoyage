// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/lib/locale';
import VietnamMap from './VietnamMap';

const renderWithLocale = (ui: React.ReactElement) =>
  render(<LocaleProvider>{ui}</LocaleProvider>);

describe('VietnamMap', () => {
  it('renders SVG with accessibility attributes', () => {
    renderWithLocale(<VietnamMap />);
    const svg = screen.getByRole('img');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-label');
    expect(svg.getAttribute('aria-label')).toContain('Việt Nam');
  });

  it('renders all 63 provinces', () => {
    const { container } = renderWithLocale(<VietnamMap />);
    const provinces = container.querySelectorAll('.province');
    expect(provinces).toHaveLength(63);
  });

  it('province names have Vietnamese diacritics', () => {
    const { container } = render(<VietnamMap />);
    const provinces = Array.from(container.querySelectorAll('.province'));
    const names = provinces.map((el) => el.getAttribute('data-name'));

    expect(names).toContain('Hà Nội');
    expect(names).toContain('Đà Nẵng');
    expect(names).toContain('Hồ Chí Minh');
  });

  it('applies legal name fixes with en-dashes and correct spelling', () => {
    const { container } = render(<VietnamMap />);
    const provinces = Array.from(container.querySelectorAll('.province'));
    const names = provinces.map((el) => el.getAttribute('data-name'));

    // En-dash (–), not hyphen (-) for compound names
    expect(names).toContain('Bà Rịa – Vũng Tàu');
    expect(names).toContain('Thừa Thiên – Huế');

    // Correct spelling: "Hòa" not "Hoà"
    expect(names).toContain('Hòa Bình');
    expect(names).not.toContain('Hoà Bình');
  });

  it('renders Hoàng Sa and Trường Sa as archipelago elements with sovereignty label', () => {
    const { container } = render(<VietnamMap />);
    const archipelagos = container.querySelectorAll('.archipelago');
    expect(archipelagos).toHaveLength(2);

    const archipelagoNames = Array.from(archipelagos).map((el) =>
      el.getAttribute('data-name'),
    );
    expect(archipelagoNames).toContain('Quần đảo Hoàng Sa (Việt Nam)');
    expect(archipelagoNames).toContain('Quần đảo Trường Sa (Việt Nam)');
  });

  it('renders all 8 city labels', () => {
    render(<VietnamMap />);
    const expectedCities = [
      'Hà Nội',
      'Vinh',
      'Huế',
      'Đà Nẵng',
      'Quy Nhơn',
      'Nha Trang',
      'Đà Lạt',
      'TP.HCM',
    ];

    for (const city of expectedCities) {
      expect(screen.getByText(city)).toBeInTheDocument();
    }
  });

  it('renders named islands — Phú Quốc, Côn Đảo, Cát Bà', () => {
    const { container } = render(<VietnamMap />);
    const namedIslands = container.querySelectorAll('.named-island');
    const islandNames = Array.from(namedIslands).map((el) =>
      el.getAttribute('data-name'),
    );

    expect(islandNames).toContain('Phú Quốc');
    expect(islandNames).toContain('Côn Đảo');
    expect(islandNames).toContain('Cát Bà');
  });

  it('sovereignty label "(Việt Nam)" appears at least twice — once per archipelago', () => {
    render(<VietnamMap />);
    const sovereigntyLabels = screen.getAllByText('(Việt Nam)');
    expect(sovereigntyLabels.length).toBeGreaterThanOrEqual(2);
  });
});
