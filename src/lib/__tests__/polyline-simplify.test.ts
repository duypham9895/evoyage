import { describe, it, expect } from 'vitest';
import { rdpSimplify, simplifyPolyline } from '../polyline-simplify';
import { decodePolyline, encodePolyline } from '../polyline';

// A zigzag polyline with many points that can be simplified
function makeZigzagPoints(count: number) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      lat: 10.0 + i * 0.01,
      lng: 106.0 + (i % 2 === 0 ? 0.005 : -0.005),
    });
  }
  return points;
}

describe('rdpSimplify', () => {
  it('reduces point count for a zigzag polyline', () => {
    const points = makeZigzagPoints(100);
    const simplified = rdpSimplify(points, 0.01);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves start and end points', () => {
    const points = makeZigzagPoints(50);
    const simplified = rdpSimplify(points, 0.01);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it('returns same array for single point', () => {
    const points = [{ lat: 10.0, lng: 106.0 }];
    const result = rdpSimplify(points, 0.001);
    expect(result).toEqual(points);
  });

  it('returns same array for two points', () => {
    const points = [
      { lat: 10.0, lng: 106.0 },
      { lat: 11.0, lng: 107.0 },
    ];
    const result = rdpSimplify(points, 0.001);
    expect(result).toEqual(points);
  });

  it('keeps collinear points as just endpoints', () => {
    // Points on a straight line should be reduced to just start/end
    const points = [
      { lat: 10.0, lng: 106.0 },
      { lat: 10.5, lng: 106.5 },
      { lat: 11.0, lng: 107.0 },
    ];
    const result = rdpSimplify(points, 0.0001);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });
});

describe('simplifyPolyline', () => {
  it('returns original if already under maxUrlChars', () => {
    const points = [
      { lat: 10.0, lng: 106.0 },
      { lat: 10.1, lng: 106.1 },
    ];
    const encoded = encodePolyline(points);
    const result = simplifyPolyline(encoded, 4000);
    expect(result).toBe(encoded);
  });

  it('produces a shorter encoded polyline for long input', () => {
    const points = makeZigzagPoints(500);
    const encoded = encodePolyline(points);
    // Use a small maxUrlChars to force simplification
    const result = simplifyPolyline(encoded, 200);
    expect(result.length).toBeLessThanOrEqual(encoded.length);
  });

  it('output stays under maxUrlChars when possible', () => {
    const points = makeZigzagPoints(300);
    const encoded = encodePolyline(points);
    const maxChars = 500;
    const result = simplifyPolyline(encoded, maxChars);
    expect(result.length).toBeLessThanOrEqual(maxChars);
  });

  it('produces a valid decodable polyline', () => {
    const points = makeZigzagPoints(200);
    const encoded = encodePolyline(points);
    const simplified = simplifyPolyline(encoded, 300);
    const decoded = decodePolyline(simplified);
    expect(decoded.length).toBeGreaterThanOrEqual(2);
    // Start and end should approximately match
    expect(decoded[0].lat).toBeCloseTo(points[0].lat, 3);
    expect(decoded[decoded.length - 1].lat).toBeCloseTo(
      points[points.length - 1].lat,
      3,
    );
  });

  it('passes through single-point polyline unchanged', () => {
    const points = [{ lat: 10.0, lng: 106.0 }];
    const encoded = encodePolyline(points);
    const result = simplifyPolyline(encoded, 5);
    expect(result).toBe(encoded);
  });

  it('passes through two-point polyline unchanged', () => {
    const points = [
      { lat: 10.0, lng: 106.0 },
      { lat: 11.0, lng: 107.0 },
    ];
    const encoded = encodePolyline(points);
    const result = simplifyPolyline(encoded, 5);
    // Two points can't be simplified further
    expect(result).toBe(encoded);
  });
});
