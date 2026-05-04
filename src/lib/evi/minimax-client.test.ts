import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallJsonLLM = vi.hoisted(() => vi.fn());
vi.mock('./llm-call', () => ({
  callJsonLLM: mockCallJsonLLM,
}));

import { parseTrip } from './minimax-client';

const VALID_EXTRACTION = {
  startLocation: null,
  endLocation: 'Đà Lạt',
  vehicleBrand: null,
  vehicleModel: null,
  currentBatteryPercent: null,
  isTripRequest: true,
  isStationSearch: false,
  stationSearchParams: null,
  isOutsideVietnam: false,
  missingFields: [],
  followUpQuestion: null,
  confidence: 0.9,
};

describe('parseTrip', () => {
  beforeEach(() => {
    mockCallJsonLLM.mockReset();
  });

  it('passes maxTokens=1024 to bound any thinking-model reasoning chain', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: VALID_EXTRACTION, provider: 'mimo' });

    await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(mockCallJsonLLM).toHaveBeenCalledOnce();
    const callArgs = mockCallJsonLLM.mock.calls[0][0] as { maxTokens: number };
    expect(callArgs.maxTokens).toBeLessThanOrEqual(1024);
  });

  it('returns parsed extraction on success', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: VALID_EXTRACTION, provider: 'mimo' });

    const result = await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(result.endLocation).toBe('Đà Lạt');
    expect(result.confidence).toBe(0.9);
  });

  it('tags caller as eVi-parse for log diagnostics', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: VALID_EXTRACTION, provider: 'mimo' });

    await parseTrip({
      message: 'test',
      history: [],
      vehicleListText: 'VinFast VF 8',
      accumulatedParams: null,
    });

    const callArgs = mockCallJsonLLM.mock.calls[0][0] as { callerTag: string };
    expect(callArgs.callerTag).toBe('eVi-parse');
  });
});
