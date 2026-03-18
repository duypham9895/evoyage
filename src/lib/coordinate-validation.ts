/**
 * Coordinate validation for Southeast Asia bounds.
 * Prevents API abuse by rejecting coordinates outside the supported region.
 */
import { z } from 'zod';

export const SOUTHEAST_ASIA_BOUNDS = {
  minLat: 0,
  maxLat: 30,
  minLng: 95,
  maxLng: 115,
} as const;

export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    lat >= SOUTHEAST_ASIA_BOUNDS.minLat &&
    lat <= SOUTHEAST_ASIA_BOUNDS.maxLat &&
    lng >= SOUTHEAST_ASIA_BOUNDS.minLng &&
    lng <= SOUTHEAST_ASIA_BOUNDS.maxLng
  );
}

export const coordinateSchema = z.object({
  lat: z.number().min(SOUTHEAST_ASIA_BOUNDS.minLat).max(SOUTHEAST_ASIA_BOUNDS.maxLat),
  lng: z.number().min(SOUTHEAST_ASIA_BOUNDS.minLng).max(SOUTHEAST_ASIA_BOUNDS.maxLng),
});

export const COORDINATE_ERROR_VI = 'Tọa độ nằm ngoài phạm vi hỗ trợ';
export const COORDINATE_ERROR_EN = 'Coordinates outside supported region';
