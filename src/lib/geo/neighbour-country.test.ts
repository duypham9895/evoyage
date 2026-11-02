import { describe, it, expect } from 'vitest';
import { isInNeighbourCountry, findForeignSegment } from './neighbour-country';

describe('isInNeighbourCountry', () => {
  it.each([
    ['Ho Chi Minh City', 10.7726, 106.698],
    ['Ha Noi', 21.0285, 105.8542],
    ['Da Lat', 11.9404, 108.4583],
    ['Buon Ma Thuot', 12.6667, 108.05],
    ['Phu Quoc', 10.2899, 103.984],
    ['Ha Tien (border town)', 10.3833, 104.4833],
    ['Moc Bai (border gate, VN side)', 11.0786, 106.1889],
    ['Lao Bao (border town)', 16.6167, 106.6],
    ['Gulf of Tonkin (sea)', 19.0, 107.5],
  ])('is false for %s, which is in Vietnam or at sea', (_name, lat, lng) => {
    expect(isInNeighbourCountry(lat, lng)).toBe(false);
  });

  it.each([
    ['Pakse (Laos)', 15.1202, 105.7987],
    ['Vientiane (Laos)', 17.9757, 102.6331],
    ['Phnom Penh (Cambodia)', 11.5564, 104.9282],
    ['Siem Reap (Cambodia)', 13.3633, 103.8564],
    ['Loco-EV station near Pakse (the bug report)', 15.1097884, 105.8210161],
  ])('is true for %s', (_name, lat, lng) => {
    expect(isInNeighbourCountry(lat, lng)).toBe(true);
  });
});

describe('findForeignSegment', () => {
  it('returns null for an in-country coastal route', () => {
    expect(findForeignSegment([
      { lat: 10.7726, lng: 106.698 },
      { lat: 13.09, lng: 109.26 },
      { lat: 15.85, lng: 108.19 },
      { lat: 21.0285, lng: 105.8542 },
    ])).toBeNull();
  });

  it('reports where a route through Cambodia/Laos first leaves Vietnam and how far it runs abroad', () => {
    const result = findForeignSegment([
      { lat: 10.7726, lng: 106.698 },
      { lat: 12.94601, lng: 106.17561 },
      { lat: 14.43832, lng: 105.886 },
      { lat: 15.11911, lng: 105.84682 },
      { lat: 16.22227, lng: 105.25832 },
      { lat: 17.42388, lng: 104.84919 },
      { lat: 21.0285, lng: 105.8542 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.foreignKm).toBeGreaterThan(5);
    // The first foreign point is Kratie (Cambodia), ~250 km from HCM.
    expect(result!.firstExitKm).toBeGreaterThan(200);
    expect(result!.firstExitKm).toBeLessThan(300);
  });

  it('tolerates a short excursion of under 5 km across the border', () => {
    // Near Moc Bai: a VN point -> a point ~1 km over the (Natural Earth) line
    // into Cambodia -> back. ~3 km abroad in total, under the 5 km tolerance.
    expect(isInNeighbourCountry(11.0786, 106.0950)).toBe(true);
    expect(isInNeighbourCountry(11.0786, 106.1100)).toBe(false);
    expect(findForeignSegment([
      { lat: 11.0786, lng: 106.1100 },
      { lat: 11.0786, lng: 106.0950 },
      { lat: 11.0786, lng: 106.1100 },
    ])).toBeNull();
  });

  it('returns null for an empty or single-point route', () => {
    expect(findForeignSegment([])).toBeNull();
    expect(findForeignSegment([{ lat: 15.12, lng: 105.8 }])).toBeNull();
  });
});
