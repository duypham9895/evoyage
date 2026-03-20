import { MinimaxTripExtraction, EViParseRequest } from './types';

// ── MinimaxTripExtraction ──

describe('MinimaxTripExtraction', () => {
  const validExtraction = {
    startLocation: 'Hà Nội',
    endLocation: 'Hải Phòng',
    vehicleBrand: 'VinFast',
    vehicleModel: 'VF 8',
    currentBatteryPercent: 85,
    isTripRequest: true,
    isOutsideVietnam: false,
    missingFields: [] as string[],
    followUpQuestion: null,
    confidence: 0.95,
  };

  it('parses a valid complete extraction', () => {
    const result = MinimaxTripExtraction.safeParse(validExtraction);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startLocation).toBe('Hà Nội');
      expect(result.data.confidence).toBe(0.95);
    }
  });

  it('parses extraction with all nullable fields set to null', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      startLocation: null,
      endLocation: null,
      vehicleBrand: null,
      vehicleModel: null,
      currentBatteryPercent: null,
      followUpQuestion: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects battery percent of 0', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      currentBatteryPercent: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects battery percent of 101', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      currentBatteryPercent: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects battery percent of -1', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      currentBatteryPercent: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative confidence', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence > 1', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid missingFields enum value', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      missingFields: ['invalid_field'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean isTripRequest', () => {
    const result = MinimaxTripExtraction.safeParse({
      ...validExtraction,
      isTripRequest: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = MinimaxTripExtraction.safeParse({
      startLocation: 'Hà Nội',
    });
    expect(result.success).toBe(false);
  });
});

// ── EViParseRequest ──

describe('EViParseRequest', () => {
  const validRequest = {
    message: 'Tôi muốn đi từ Hà Nội đến Hải Phòng',
    history: [
      { role: 'user' as const, content: 'Xin chào' },
      { role: 'assistant' as const, content: 'Chào bạn!' },
    ],
    userLocation: { lat: 21.0285, lng: 105.8542 },
  };

  it('parses a valid complete request', () => {
    const result = EViParseRequest.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe(validRequest.message);
      expect(result.data.history).toHaveLength(2);
      expect(result.data.userLocation?.lat).toBe(21.0285);
    }
  });

  it('parses request with empty history and null location (defaults)', () => {
    const result = EViParseRequest.safeParse({
      message: 'Hello',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.history).toEqual([]);
      expect(result.data.userLocation).toBeNull();
    }
  });

  it('rejects empty message', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message longer than 500 chars', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      message: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects history with more than 10 items', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      history: Array.from({ length: 11 }, () => ({
        role: 'user',
        content: 'msg',
      })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects history item content longer than 500 chars', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      history: [{ role: 'user', content: 'x'.repeat(501) }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role in history', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      history: [{ role: 'system', content: 'hello' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid lat (out of range)', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      userLocation: { lat: 91, lng: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid lng (out of range)', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      userLocation: { lat: 0, lng: 181 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts null userLocation', () => {
    const result = EViParseRequest.safeParse({
      ...validRequest,
      userLocation: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userLocation).toBeNull();
    }
  });
});
