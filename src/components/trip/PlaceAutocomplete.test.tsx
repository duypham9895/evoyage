// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import PlaceAutocomplete from './PlaceAutocomplete';
import { AA_NORMAL_TEXT, contrastRatio, textColorToken, tokenHex } from '@/lib/__tests__/wcag-contrast';

vi.mock('@/lib/geo/nominatim', () => ({
  searchPlaces: vi.fn().mockResolvedValue([]),
}));

function renderOrigin(value = '') {
  return render(
    <PlaceAutocomplete
      value={value}
      onChange={vi.fn()}
      onSelect={vi.fn()}
      label="Điểm đi"
      placeholder="VD: Thủ Thiêm, TP.HCM"
    />,
  );
}

describe('PlaceAutocomplete accessibility', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // BUG(p3-accessibility-wcag): the visible <label> is not associated with the combobox, so its name is the placeholder. See docs/bugs/2026-11-01-p3-accessibility-wcag.md
  it('names the combobox by its visible label, not by the example placeholder (WCAG 1.3.1 / 4.1.2)', () => {
    renderOrigin();
    expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toBeInTheDocument();
  });

  // BUG(p3-accessibility-wcag): the visible <label> is not associated with the combobox, so getByLabelText cannot find it. See docs/bugs/2026-11-01-p3-accessibility-wcag.md
  it('keeps the field label reachable after the user has typed a value', () => {
    renderOrigin('Quận 1');
    expect(screen.getByLabelText('Điểm đi')).toHaveValue('Quận 1');
  });

  it('keeps the placeholder as the accessible name when the label is empty (waypoint inputs)', () => {
    render(
      <PlaceAutocomplete
        value=""
        onChange={vi.fn()}
        onSelect={vi.fn()}
        label=""
        placeholder="Tìm điểm dừng"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Tìm điểm dừng' })).toBeInTheDocument();
  });

  // BUG(p3-accessibility-wcag): the field label uses --color-muted (#6B6B78), 3.30:1 on the surface card. Fixed: text-secondary. See docs/bugs/2026-11-01-p3-accessibility-wcag.md
  it('renders the field label with at least 4.5:1 contrast on the surface card (WCAG 1.4.3)', () => {
    renderOrigin();
    const label = screen.getByText('Điểm đi');
    const fg = tokenHex(textColorToken(label.className));
    expect(contrastRatio(fg, tokenHex('surface'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
