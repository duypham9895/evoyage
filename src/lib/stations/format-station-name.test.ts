import { describe, it, expect } from 'vitest';
import { formatStationName, stripDirectionTag } from './format-station-name';

describe('formatStationName', () => {
  it('turns a trailing "<chiều đi>" feed tag into a plain "(chiều đi)" suffix', () => {
    expect(formatStationName('Trạm dừng nghỉ Km 45 <chiều đi>')).toBe('Trạm dừng nghỉ Km 45 (chiều đi)');
  });

  it('turns "<chiều về>" into "(chiều về)"', () => {
    expect(formatStationName('Trạm dừng nghỉ Km 45 <chiều về>')).toBe('Trạm dừng nghỉ Km 45 (chiều về)');
  });

  it('handles a tag in the middle of the name and collapses extra whitespace', () => {
    expect(formatStationName('Cao tốc  <chiều về>  Km 12')).toBe('Cao tốc (chiều về) Km 12');
  });

  it('handles a tag with no surrounding spaces, inner padding, and capitalisation', () => {
    expect(formatStationName('Trạm A<Chiều Đi>')).toBe('Trạm A (chiều đi)');
    expect(formatStationName('Trạm A < chiều về >')).toBe('Trạm A (chiều về)');
  });

  it('matches decomposed (NFD) Vietnamese text from the feed', () => {
    expect(formatStationName('Trạm A <chiều đi>'.normalize('NFD'))).toBe('Trạm A (chiều đi)');
  });

  it('leaves names without a direction tag unchanged', () => {
    expect(formatStationName('VinFast Times City')).toBe('VinFast Times City');
    expect(formatStationName('Trạm <khác>')).toBe('Trạm <khác>');
  });

  it('returns an empty string for empty input', () => {
    expect(formatStationName('')).toBe('');
  });
});

describe('stripDirectionTag', () => {
  it('removes the tag entirely for space-constrained labels', () => {
    expect(stripDirectionTag('Trạm dừng nghỉ Km 45 <chiều đi>')).toBe('Trạm dừng nghỉ Km 45');
    expect(stripDirectionTag('Cao tốc <chiều về> Km 12')).toBe('Cao tốc Km 12');
  });

  it('leaves names without a direction tag unchanged', () => {
    expect(stripDirectionTag('VinFast Times City')).toBe('VinFast Times City');
  });
});
