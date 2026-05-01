import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVGreenFaq } from './parse-vgreen';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/__fixtures__/energy-prices/vgreen-faq.html',
);

describe('parseVGreenFaq', () => {
  const html = readFileSync(FIXTURE, 'utf8');

  it('extracts the per-kWh charging rate from the FAQ HTML', () => {
    const result = parseVGreenFaq(html);
    expect(result.vndPerKwh).toBe(3858);
  });

  it('extracts the effective date in ISO format', () => {
    const result = parseVGreenFaq(html);
    expect(result.effectiveAt).toBe('2024-03-19');
  });

  it('throws a descriptive error when the price marker is missing', () => {
    expect(() => parseVGreenFaq('<html>nothing here</html>')).toThrow(/V-GREEN/i);
  });

  it('throws when the price text is malformed', () => {
    const broken = '<p>Đơn giá sạc: abc VNĐ/kWh áp dụng từ ngày 19/03/2024</p>';
    expect(() => parseVGreenFaq(broken)).toThrow(/V-GREEN/i);
  });

  it('parses a synthetic well-formed snippet', () => {
    const synthetic =
      '<p>Đơn giá sạc: 4.123 VNĐ/kWh áp dụng từ ngày 02/01/2026</p>';
    const result = parseVGreenFaq(synthetic);
    expect(result.vndPerKwh).toBe(4123);
    expect(result.effectiveAt).toBe('2026-01-02');
  });
});
