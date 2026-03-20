import { describe, it, expect } from 'vitest';

// Mirrors shortenDisplayName from TripInput.tsx
function shortenDisplayName(name: string): string {
  const parts = name.split(', ');
  const meaningful = parts.filter(p => !/^\d{4,}$/.test(p.trim()) && p.trim() !== 'Việt Nam' && p.trim() !== 'Vietnam');
  return meaningful.slice(0, Math.min(meaningful.length, 3)).join(', ');
}

describe('shortenDisplayName', () => {
  it('shortens a full Vietnamese address', () => {
    const full = 'Phường Thủ Đức, Thành phố Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam';
    expect(shortenDisplayName(full)).toBe('Phường Thủ Đức, Thành phố Thủ Đức, Thành phố Hồ Chí Minh');
  });

  it('removes zip codes', () => {
    const withZip = 'Đà Lạt, Phường Xuân Hương, Tỉnh Lâm Đồng, 02633, Việt Nam';
    const result = shortenDisplayName(withZip);
    expect(result).not.toContain('02633');
    expect(result).not.toContain('Việt Nam');
  });

  it('removes Vietnam country name', () => {
    const withCountry = 'Quận 1, HCM, Việt Nam';
    expect(shortenDisplayName(withCountry)).toBe('Quận 1, HCM');
  });

  it('removes English Vietnam', () => {
    const withEnglish = 'District 1, Ho Chi Minh City, Vietnam';
    expect(shortenDisplayName(withEnglish)).toBe('District 1, Ho Chi Minh City');
  });

  it('keeps short names intact', () => {
    expect(shortenDisplayName('Đà Lạt')).toBe('Đà Lạt');
  });

  it('limits to 3 meaningful parts', () => {
    const long = 'Part1, Part2, Part3, Part4, Part5';
    expect(shortenDisplayName(long)).toBe('Part1, Part2, Part3');
  });

  it('handles empty string', () => {
    expect(shortenDisplayName('')).toBe('');
  });

  it('handles single part', () => {
    expect(shortenDisplayName('Hà Nội')).toBe('Hà Nội');
  });

  it('removes 5-digit zip codes', () => {
    const withZip = 'Vũng Tàu, Thành phố Hồ Chí Minh, 78207, Việt Nam';
    const result = shortenDisplayName(withZip);
    expect(result).not.toContain('78207');
  });
});
