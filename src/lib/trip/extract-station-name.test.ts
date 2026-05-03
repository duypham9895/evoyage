import { describe, it, expect } from 'vitest';
import { extractStationShortName } from './extract-station-name';

describe('extractStationShortName', () => {
  it('strips "Nhượng quyền Vinfast" prefix and takes last 2 meaningful words', () => {
    expect(extractStationShortName('Nhượng quyền Vinfast Cơm Niêu Hồng Nhung')).toBe(
      'Hồng Nhung',
    );
  });

  it('strips "NQ" prefix', () => {
    expect(extractStationShortName('NQ LADO Thị trấn Liên Nghĩa')).toBe('Liên Nghĩa');
  });

  it('strips "V-GREEN" prefix', () => {
    expect(extractStationShortName('V-GREEN Quận 1')).toBe('Quận 1');
  });

  it('strips "VinFast" prefix (case-insensitive)', () => {
    expect(extractStationShortName('VinFast Times City')).toBe('Times City');
  });

  it('strips "Trạm sạc" prefix', () => {
    expect(extractStationShortName('Trạm sạc Cầu Giấy')).toBe('Cầu Giấy');
  });

  it('returns "Trạm" fallback for empty input', () => {
    expect(extractStationShortName('')).toBe('Trạm');
    expect(extractStationShortName('   ')).toBe('Trạm');
  });

  it('falls back to last 3 words when last 2 are < 8 chars', () => {
    // "Trạm A B" → last-2 = "A B" (3 chars) → take last 3 instead
    expect(extractStationShortName('Trạm sạc Khu A B')).toBe('Khu A B');
  });

  it('truncates with ellipsis when result exceeds 14 chars', () => {
    // 20-char single word
    expect(extractStationShortName('SuperLongStationName')).toBe('SuperLongStat…');
  });

  it('preserves diacritics through truncation', () => {
    // Long Vietnamese phrase with diacritics
    const result = extractStationShortName('Trạm sạc Quận Bình Thạnh Đông Tây');
    expect(result.length).toBeLessThanOrEqual(14);
  });

  it('handles inputs that are already short and clean', () => {
    expect(extractStationShortName('Cát Bà')).toBe('Cát Bà');
  });
});
