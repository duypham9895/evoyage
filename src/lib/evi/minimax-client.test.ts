import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
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
    vi.clearAllMocks();
    process.env.MINIMAX_API_KEY = 'test-key';
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_EXTRACTION) } }],
    });
  });

  it('caps max_tokens at 1024 to bound the M2.7 reasoning chain', async () => {
    await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0] as { max_tokens?: number };
    expect(callArgs.max_tokens).toBeDefined();
    expect(callArgs.max_tokens!).toBeLessThanOrEqual(1024);
  });
});
