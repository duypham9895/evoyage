/**
 * Tests for the pure data-shaping functions inside vinfast-client.
 *
 * The impit / Playwright fetch orchestration (`fetchVinFastDetailWithProgress`)
 * is intentionally NOT covered here — it requires native-binding mocking
 * and is better exercised by the E2E suite hitting a real SSE response.
 * What this file covers is the substantive transformation: the raw VinFast
 * locator JSON → typed `VinFastStationDetail` mapping, plus the Cloudflare
 * challenge / invalid-JSON guards.
 */
import { describe, it, expect } from 'vitest';
import { parseDetailResponse, parseResponse } from './vinfast-client';

const VALID_RAW = {
  data: {
    entity_id: 'station-entity-1',
    store_id: 'C.HNO0001',
    name: 'VinFast Vincom Bà Triệu',
    address: '191 Bà Triệu, Hà Nội',
    charging_status: 'ACTIVE',
    parking_fee: false,
    access_type: 'Public',
    lat: '21.0123',
    lng: '105.8456',
    data: {
      id: 'C.HNO0001',
      province: 'Hà Nội',
      district: 'Hai Bà Trưng',
      commune: 'Phường Bùi Thị Xuân',
      coordinates: { latitude: '21.0123', longitude: '105.8456' },
      charging_when_closed: true,
      opening_times: { twentyfourseven: true },
      evses: [
        {
          physical_reference: 'A1',
          parking_restrictions: [],
          last_updated: '2026-05-20T00:00:00Z',
          connectors: [
            {
              id: '1',
              standard: 'IEC_62196_T2_COMBO',
              format: 'CABLE',
              power_type: 'DC',
              max_voltage: 1000,
              max_amperage: 250,
              max_electric_power: 250_000,
              last_updated: '2026-05-20T00:00:00Z',
            },
            {
              id: '2',
              standard: 'CHADEMO',
              format: 'CABLE',
              power_type: 'DC',
              max_voltage: 500,
              max_amperage: 125,
              max_electric_power: 50_000,
              last_updated: '2026-05-20T00:00:00Z',
            },
          ],
        },
        {
          physical_reference: 'A2',
          parking_restrictions: [],
          last_updated: '2026-05-20T00:00:00Z',
          connectors: [
            {
              id: '3',
              standard: 'IEC_62196_T2',
              format: 'SOCKET',
              power_type: 'AC',
              max_voltage: 400,
              max_amperage: 32,
              max_electric_power: 22_000,
              last_updated: '2026-05-20T00:00:00Z',
            },
          ],
        },
      ],
      images: [
        { url: 'https://vinfastauto.com/img/a.jpg', category: 'main' },
        { url: 'https://attacker.example.com/evil.jpg', category: 'main' },
        { url: 'http://insecure.example.com/img.jpg', category: 'main' },
      ],
      extra_data: {
        depot_status: 'OPEN',
        parking_fee: false,
        access_type: 'Public',
        stations: [
          { code: 'HW-1', vendor: 'XCharge', max_power: 250, model_code: 'XC-DC-250' },
        ],
      },
    },
  },
} as const;

describe('parseDetailResponse', () => {
  it('parses a valid response with multi-evse + multi-connector + extras', () => {
    const result = parseDetailResponse(VALID_RAW as Record<string, unknown>);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.entityId).toBe('station-entity-1');
    expect(result.storeId).toBe('C.HNO0001');
    expect(result.name).toBe('VinFast Vincom Bà Triệu');
    expect(result.province).toBe('Hà Nội');
    expect(result.district).toBe('Hai Bà Trưng');
    expect(result.latitude).toBeCloseTo(21.0123);
    expect(result.longitude).toBeCloseTo(105.8456);
    expect(result.is24h).toBe(true);
    expect(result.chargingWhenClosed).toBe(true);
    expect(result.parkingFee).toBe(false);
    expect(result.accessType).toBe('Public');
    expect(result.depotStatus).toBe('OPEN');
    expect(result.portCount).toBe(2);
    expect(result.hardwareStations).toEqual([
      { code: 'HW-1', vendor: 'XCharge', maxPower: 250, modelCode: 'XC-DC-250' },
    ]);
  });

  it('picks the highest-power connector across all evses for maxPowerKw', () => {
    const result = parseDetailResponse(VALID_RAW as Record<string, unknown>);
    expect(result?.maxPowerKw).toBe(250);
  });

  it('maps OCPI connector standards to human-readable names + dedupes', () => {
    const result = parseDetailResponse(VALID_RAW as Record<string, unknown>);
    expect(result?.connectorSummary).toEqual(expect.arrayContaining(['CCS2', 'CHAdeMO', 'Type2_AC']));
    expect(result?.connectorSummary).toHaveLength(3);
  });

  it('drops images whose URL is not https + vinfastauto.com (SSRF / asset-spoofing guard)', () => {
    const result = parseDetailResponse(VALID_RAW as Record<string, unknown>);
    expect(result?.images).toHaveLength(1);
    expect(result?.images[0]?.url).toBe('https://vinfastauto.com/img/a.jpg');
  });

  it('returns null when raw.data is missing (defensive)', () => {
    expect(parseDetailResponse({})).toBeNull();
    expect(parseDetailResponse({ entity_id: 'x' })).toBeNull();
  });

  it('returns null when raw.data.data is missing', () => {
    expect(parseDetailResponse({ data: { entity_id: 'x' } })).toBeNull();
  });

  it('handles empty evses without crashing — maxPowerKw=0, portCount=0', () => {
    const result = parseDetailResponse({
      data: {
        entity_id: 'empty-station',
        data: { id: 'X', evses: [] },
      },
    });
    expect(result).not.toBeNull();
    expect(result?.maxPowerKw).toBe(0);
    expect(result?.portCount).toBe(0);
    expect(result?.connectorSummary).toEqual([]);
  });

  it('falls back to outer.lat/lng when inner.coordinates is absent', () => {
    const raw = {
      data: {
        entity_id: 'fallback-station',
        lat: '10.7626',
        lng: '106.6602',
        data: { id: 'X', evses: [] },
      },
    };
    const result = parseDetailResponse(raw);
    expect(result?.latitude).toBeCloseTo(10.7626);
    expect(result?.longitude).toBeCloseTo(106.6602);
  });

  it('passes unknown connector standards through unchanged', () => {
    const raw = {
      data: {
        entity_id: 'unknown-conn',
        data: {
          id: 'X',
          evses: [{ connectors: [{ standard: 'FUTURE_STANDARD_X', max_electric_power: 100 }] }],
        },
      },
    };
    const result = parseDetailResponse(raw);
    expect(result?.connectorSummary).toEqual(['FUTURE_STANDARD_X']);
  });

  it('coerces string lat/lng to numbers', () => {
    const result = parseDetailResponse(VALID_RAW as Record<string, unknown>);
    expect(typeof result?.latitude).toBe('number');
    expect(typeof result?.longitude).toBe('number');
  });

  it('sets fetchedAt to an ISO 8601 timestamp', () => {
    const result = parseDetailResponse(VALID_RAW as Record<string, unknown>);
    expect(result?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('parseResponse', () => {
  it('returns parsed detail for a valid JSON body', () => {
    const body = JSON.stringify(VALID_RAW);
    const result = parseResponse(body);
    expect(result?.entityId).toBe('station-entity-1');
  });

  it('detects Cloudflare IM_UNDER_ATTACK challenge and returns null', () => {
    const body = '<html>...::IM_UNDER_ATTACK_BOX:: ...</html>';
    expect(parseResponse(body)).toBeNull();
  });

  it('detects challenge-platform marker (alternate CF variant)', () => {
    const body = '<html><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/...">';
    expect(parseResponse(body)).toBeNull();
  });

  it('returns null on invalid JSON without throwing', () => {
    expect(parseResponse('not-json-at-all')).toBeNull();
    expect(parseResponse('{partial')).toBeNull();
    expect(parseResponse('')).toBeNull();
  });

  it('returns null when JSON parses but parseDetailResponse rejects shape', () => {
    expect(parseResponse('{}')).toBeNull();
    expect(parseResponse('{"data":{"entity_id":"x"}}')).toBeNull();
  });
});
