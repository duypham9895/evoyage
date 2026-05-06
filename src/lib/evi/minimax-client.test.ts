import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallLLM = vi.hoisted(() => vi.fn());
vi.mock('./llm-module', () => ({
  callLLM: mockCallLLM,
}));

import { parseTrip } from './minimax-client';
import { MinimaxTripExtraction } from './types';

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
    mockCallLLM.mockReset();
  });

  it('passes maxTokens=1024 to bound any thinking-model reasoning chain', async () => {
    mockCallLLM.mockResolvedValueOnce(VALID_EXTRACTION);

    await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(mockCallLLM).toHaveBeenCalledOnce();
    const callArgs = mockCallLLM.mock.calls[0][0] as { maxTokens: number };
    expect(callArgs.maxTokens).toBeLessThanOrEqual(1024);
  });

  it('returns parsed extraction on success', async () => {
    mockCallLLM.mockResolvedValueOnce(VALID_EXTRACTION);

    const result = await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(result.endLocation).toBe('Đà Lạt');
    expect(result.confidence).toBe(0.9);
  });

  it('passes the MinimaxTripExtraction schema to callLLM (validation lives in the Module)', async () => {
    mockCallLLM.mockResolvedValueOnce(VALID_EXTRACTION);

    await parseTrip({
      message: 'test',
      history: [],
      vehicleListText: 'VinFast VF 8',
      accumulatedParams: null,
    });

    const callArgs = mockCallLLM.mock.calls[0][0] as { schema: typeof MinimaxTripExtraction };
    expect(callArgs.schema).toBe(MinimaxTripExtraction);
  });

  it('threads multi-turn history into the user payload so context survives the single-string Seam', async () => {
    mockCallLLM.mockResolvedValueOnce(VALID_EXTRACTION);

    await parseTrip({
      message: 'Đà Lạt',
      history: [
        { role: 'user', content: 'Đi đâu cuối tuần này nhỉ?' },
        { role: 'assistant', content: 'Bạn muốn đi đâu?' },
      ],
      vehicleListText: 'VinFast VF 8',
      accumulatedParams: null,
    });

    const callArgs = mockCallLLM.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('Đi đâu cuối tuần này nhỉ?');
    expect(callArgs.user).toContain('Bạn muốn đi đâu?');
    expect(callArgs.user).toContain('Đà Lạt');
    // Current message must come after history so the model treats it as the live turn.
    expect(callArgs.user.lastIndexOf('Đà Lạt')).toBeGreaterThan(
      callArgs.user.indexOf('Đi đâu cuối tuần này nhỉ?'),
    );
  });
});
