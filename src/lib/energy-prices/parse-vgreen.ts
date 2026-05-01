/**
 * Parser for the V-GREEN (VinFast charging) FAQ page.
 *
 * The FAQ at https://vgreen.net/vi/cau-hoi-thuong-gap is server-rendered HTML
 * containing a stable text block of the shape:
 *
 *   "Đơn giá sạc: 3.858 VNĐ/kWh áp dụng từ ngày 19/03/2024"
 *
 * We extract the per-kWh rate and the effective date (Vietnam-format dd/mm/yyyy
 * → ISO yyyy-mm-dd).
 */
export interface VGreenPrice {
  readonly vndPerKwh: number;
  readonly effectiveAt: string;
}

const PRICE_RE =
  /Đơn giá sạc:\s*([0-9]+(?:[.,][0-9]{3})*)\s*VNĐ\/kWh\s*áp dụng từ ngày\s*([0-9]{2})\/([0-9]{2})\/([0-9]{4})/i;

export function parseVGreenFaq(html: string): VGreenPrice {
  const match = html.match(PRICE_RE);
  if (!match) {
    throw new Error('V-GREEN parser: price/date marker not found in HTML');
  }

  const [, rawPrice, dd, mm, yyyy] = match;
  const vndPerKwh = Number.parseInt(rawPrice.replace(/[.,]/g, ''), 10);
  if (!Number.isFinite(vndPerKwh) || vndPerKwh <= 0) {
    throw new Error(`V-GREEN parser: invalid price value "${rawPrice}"`);
  }

  return {
    vndPerKwh,
    effectiveAt: `${yyyy}-${mm}-${dd}`,
  };
}
