import { describe, it, expect } from 'vitest';
import { extractCityName } from './extract-city';

describe('extractCityName', () => {
  it('returns "TP.HCM" for the canonical Ho Chi Minh address pattern', () => {
    expect(
      extractCityName(
        'Hẻm 1041/62 Đường Trần Xuân Soạn, Khu phố 73, Phường Tân Hưng, Thành phố Hồ Chí Minh, 72911, Việt Nam',
      ),
    ).toBe('TP.HCM');
  });

  it('returns "TP. Hồ Chí Minh" → "TP.HCM"', () => {
    expect(extractCityName('123 Lê Lợi, TP. Hồ Chí Minh, Việt Nam')).toBe('TP.HCM');
  });

  it('returns "TP.HCM" already-abbreviated form unchanged (regression for visual QA bug 2026-05-03)', () => {
    // Real input from sample-trip chips: "Quận 1, TP.HCM" — visual QA showed
    // the headline rendering as "Quận 1" instead of "TP.HCM" because the
    // walk-start-to-end logic hit "Quận 1" first via fallback path. Adding
    // an explicit TP.HCM pattern fixes this.
    expect(extractCityName('Quận 1, TP.HCM')).toBe('TP.HCM');
    expect(extractCityName('Thủ Thiêm, TP HCM')).toBe('TP.HCM');
    expect(extractCityName('Bình Thạnh, TPHCM')).toBe('TP.HCM');
  });

  it('handles informal "Sài Gòn" form', () => {
    expect(extractCityName('Quận 3, Sài Gòn')).toBe('Sài Gòn');
  });

  it('returns "Đà Lạt" for the canonical Da Lat pattern', () => {
    expect(
      extractCityName(
        'Đường Xuân Hương, Phường Xuân Hương - Đà Lạt, Thành phố Đà Lạt, Tỉnh Lâm Đồng, Việt Nam',
      ),
    ).toBe('Đà Lạt');
  });

  it('returns "Lâm Đồng" when only Tỉnh segment is present', () => {
    expect(extractCityName('Bảo Lộc, Tỉnh Lâm Đồng, Việt Nam')).toBe('Lâm Đồng');
  });

  it('returns "Hà Nội" for canonical Hanoi patterns', () => {
    expect(extractCityName('123 Tràng Tiền, Thành phố Hà Nội, Việt Nam')).toBe('Hà Nội');
    expect(extractCityName('123 Tràng Tiền, Thủ đô Hà Nội, Việt Nam')).toBe('Hà Nội');
  });

  it('returns short addresses unchanged when already display-friendly', () => {
    expect(extractCityName('Đà Lạt')).toBe('Đà Lạt');
  });

  it('returns "—" placeholder for empty input', () => {
    expect(extractCityName('')).toBe('—');
    expect(extractCityName('   ')).toBe('—');
  });

  it('truncates with ellipsis at 12 chars when no patterns match', () => {
    expect(extractCityName('SomeReallyLongUnknownPlace')).toBe('SomeReallyL…');
  });

  it('drops trailing "Việt Nam" segment before extraction', () => {
    expect(extractCityName('Foo, Bar, Việt Nam')).toBe('Foo');
  });

  it('drops postal-code segments (digit-only)', () => {
    expect(
      extractCityName('Foo, Phường X, Thành phố Đà Lạt, 67000, Việt Nam'),
    ).toBe('Đà Lạt');
  });

  it('falls back to second-to-last meaningful part when no Thành phố/Tỉnh marker', () => {
    expect(extractCityName('123 Some Street, MyDistrict, MyCity')).toBe('MyDistrict');
  });

  it('handles single-segment fallback', () => {
    expect(extractCityName('JustOneSegment')).toBe('JustOneSegm…');
  });
});
