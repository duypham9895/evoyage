import type { RangeResult, RangeSafetyWarning } from '@/types';

interface VehicleForRange {
  readonly brand: string;
  readonly model: string;
  readonly variant: string | null;
  readonly officialRangeKm: number;
}

/**
 * Core range calculation using the Range Safety Factor rule.
 *
 * Real-world range = officialRangeKm × rangeSafetyFactor
 * Usable range = real-world range × (currentBattery% - minArrival%) / 100
 *
 * Returns 0 for usable range if current battery is at or below min arrival.
 */
export function calculateUsableRange(
  vehicle: VehicleForRange,
  currentBatteryPercent: number,
  minArrivalPercent: number,
  rangeSafetyFactor: number = 0.80,
): RangeResult {
  const maxRangeKm = vehicle.officialRangeKm * rangeSafetyFactor;

  const spendablePercent = currentBatteryPercent - minArrivalPercent;
  const usableRangeKm =
    spendablePercent > 0 ? maxRangeKm * (spendablePercent / 100) : 0;

  const displayName = vehicle.variant
    ? `${vehicle.brand} ${vehicle.model} ${vehicle.variant}`
    : `${vehicle.brand} ${vehicle.model}`;

  const factorPercent = Math.round(rangeSafetyFactor * 100);
  const explanation =
    `${displayName}: ${vehicle.officialRangeKm}km official → ` +
    `${maxRangeKm.toFixed(0)}km real-world (×${factorPercent}%) → ` +
    `${usableRangeKm.toFixed(0)}km usable (${currentBatteryPercent}% → ${minArrivalPercent}%)`;

  return { maxRangeKm, usableRangeKm, explanation };
}

/**
 * Returns a bilingual safety warning based on the Range Safety Factor value.
 *
 * Tiers:
 *   ≤0.70  → safe (very conservative, green)
 *   0.71–0.80 → caution (recommended, green)
 *   0.81–0.90 → warning (optimistic, orange)
 *   0.91–1.00 → danger (very risky, red)
 */
export function getRangeSafetyWarning(factor: number): RangeSafetyWarning {
  if (factor <= 0.70) {
    return {
      level: 'safe',
      messageVi:
        '🛡️ Rất an toàn — phù hợp khi chạy đường đèo, bật điều hòa hết cỡ, hoặc chở nặng.',
      messageEn:
        '🛡️ Very conservative — good for mountain roads, full AC, or heavy loads.',
      color: 'green',
    };
  }

  if (factor <= 0.80) {
    return {
      level: 'caution',
      messageVi:
        '✅ Khuyến nghị — phù hợp cho hầu hết các chuyến đi đường dài tại Việt Nam.',
      messageEn:
        '✅ Recommended — suitable for most long-distance trips in Vietnam.',
      color: 'green',
    };
  }

  if (factor <= 0.90) {
    return {
      level: 'warning',
      messageVi:
        '⚠️ Lạc quan — chỉ phù hợp khi lái nhẹ nhàng trên đường bằng phẳng, không bật điều hòa. ' +
        'Nếu gặp kẹt xe hoặc phải chạy tốc độ cao trên cao tốc, bạn có thể không đến được trạm sạc tiếp theo.',
      messageEn:
        '⚠️ Optimistic — only safe with gentle driving on flat roads, AC off. ' +
        'If you hit traffic or highway speeds, you may not reach the next charging station.',
      color: 'orange',
    };
  }

  return {
    level: 'danger',
    messageVi:
      '🚨 RẤT RỦI RO — Hầu như không ai đạt được quãng đường nhà sản xuất công bố trong thực tế. ' +
      'Đặc biệt tại Việt Nam với thời tiết nóng (điều hòa tiêu tốn 15-20% pin), đường đông, và tốc độ cao. ' +
      'Bạn có nguy cơ hết pin giữa đường. Chúng tôi KHÔNG khuyến nghị giá trị này.',
    messageEn:
      '🚨 VERY RISKY — Almost nobody achieves manufacturer-claimed range in real-world driving. ' +
      'Especially in Vietnam with hot weather (AC drains 15-20% battery), heavy traffic, and highway speeds. ' +
      'You risk running out of battery mid-trip. We DO NOT recommend this setting.',
    color: 'red',
  };
}
