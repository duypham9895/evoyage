import { z } from 'zod';
import type { EVVehicleData } from '@/types';

// ── Station Search Params Schema ──
export const StationSearchParams = z.object({
  radiusKm: z.number().min(1).max(50).default(5),
  minPowerKw: z.number().min(0).nullable().default(null),
}).nullable().default(null);

export type StationSearchParamsData = z.infer<typeof StationSearchParams>;

// ── Minimax LLM Output Schema ──
export const MinimaxTripExtraction = z.object({
  startLocation: z.string().nullable(),
  endLocation: z.string().nullable(),
  vehicleBrand: z.string().nullable(),
  vehicleModel: z.string().nullable(),
  currentBatteryPercent: z.number().min(1).max(100).nullable(),
  isTripRequest: z.boolean(),
  isStationSearch: z.boolean().default(false),
  stationSearchParams: StationSearchParams,
  isOutsideVietnam: z.boolean(),
  missingFields: z.array(z.enum([
    'start_location', 'end_location', 'vehicle', 'battery',
  ])),
  followUpQuestion: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type MinimaxTripExtractionResult = z.infer<typeof MinimaxTripExtraction>;

// ── API Request Schema ──
export const EViParseRequest = z.object({
  message: z.string().min(1).max(500),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(500),
  })).max(10).default([]),
  userLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().default(null),
  previousVehicleId: z.string().nullable().default(null),
  accumulatedParams: z.object({
    start: z.string().nullable().default(null),
    end: z.string().nullable().default(null),
    vehicleBrand: z.string().nullable().default(null),
    vehicleModel: z.string().nullable().default(null),
    currentBattery: z.number().nullable().default(null),
  }).nullable().default(null),
});

export type EViParseRequestData = z.infer<typeof EViParseRequest>;

// ── Follow-up Type Discriminator ──
export type FollowUpType = 'vehicle_pick' | 'location_input' | 'free_text' | null;

// ── Suggested Option (for vehicle_pick) ──
export interface SuggestedOption {
  readonly label: string;
  readonly vehicleId: string | null;
}

// ── Trip Params (returned to client) ──
export interface EViTripParams {
  readonly start: string | null;
  readonly startLat: number | null;
  readonly startLng: number | null;
  readonly startSource: 'geolocation' | 'parsed' | null;
  readonly end: string | null;
  readonly endLat: number | null;
  readonly endLng: number | null;
  readonly vehicleId: string | null;
  readonly vehicleName: string | null;
  readonly vehicleData: EVVehicleData | null;
  readonly currentBattery: number | null;
  readonly minArrival: number | null;
  readonly rangeSafetyFactor: number | null;
}

// ── Nearby Station Info ──
export interface NearbyStationInfo {
  readonly name: string;
  readonly distanceKm: number;
  readonly maxPowerKw: number;
  readonly connectorTypes: readonly string[];
  readonly provider: string;
  readonly isCompatible: boolean;
  readonly estimatedChargeTimeMin: number | null;
  readonly chargingStatus: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

// ── API Response ──
export interface EViParseResponse {
  readonly isComplete: boolean;
  readonly isStationSearch: boolean;
  readonly followUpType: FollowUpType;
  readonly tripParams: EViTripParams;
  readonly followUpQuestion: string | null;
  readonly followUpCount: number;
  readonly maxFollowUps: number;
  readonly suggestedOptions: readonly SuggestedOption[];
  readonly displayMessage: string;
  readonly error: string | null;
  readonly nearbyStations: readonly NearbyStationInfo[] | null;
}

// ── Chat Message (client-side conversation state) ──
export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
