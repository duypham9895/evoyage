import { resolveVehicle } from './vehicle-resolver';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    eVVehicle: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/vietnam-models', () => ({
  VIETNAM_MODELS: [
    { id: 'vf3', brand: 'VinFast', model: 'VF 3', variant: null, batteryCapacityKwh: 18.64, officialRangeKm: 210, availableInVietnam: true },
    { id: 'vf8-plus', brand: 'VinFast', model: 'VF 8', variant: 'Plus', batteryCapacityKwh: 87.7, officialRangeKm: 471, availableInVietnam: true },
    { id: 'vf8-eco', brand: 'VinFast', model: 'VF 8', variant: 'Eco', batteryCapacityKwh: 82, officialRangeKm: 420, availableInVietnam: true },
    { id: 'byd-atto3', brand: 'BYD', model: 'Atto 3', variant: null, batteryCapacityKwh: 60.48, officialRangeKm: 420, availableInVietnam: true },
  ],
}));

const mockFindMany = prisma.eVVehicle.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFindMany.mockReset();
});

describe('resolveVehicle', () => {
  it('returns not_found when both brand and model are null', async () => {
    const result = await resolveVehicle(null, null);
    expect(result.type).toBe('not_found');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns match when exactly one vehicle matches from DB', async () => {
    const vehicle = { id: 'vf3', brand: 'VinFast', model: 'VF 3', batteryCapacityKwh: 18.64 };
    mockFindMany.mockResolvedValue([vehicle]);

    const result = await resolveVehicle('VinFast', 'VF 3');
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.vehicle).toEqual(vehicle);
    }
  });

  it('returns multiple when multiple vehicles match from DB', async () => {
    const vehicles = [
      { id: 'vf8-plus', brand: 'VinFast', model: 'VF 8', variant: 'Plus' },
      { id: 'vf8-eco', brand: 'VinFast', model: 'VF 8', variant: 'Eco' },
    ];
    mockFindMany.mockResolvedValue(vehicles);

    const result = await resolveVehicle('VinFast', 'VF 8');
    expect(result.type).toBe('multiple');
    if (result.type === 'multiple') {
      expect(result.options).toHaveLength(2);
    }
  });

  it('returns not_found when no vehicle matches', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await resolveVehicle('Tesla', 'Model 3');
    expect(result.type).toBe('not_found');
  });

  it('falls back to VIETNAM_MODELS when DB throws error', async () => {
    mockFindMany.mockRejectedValue(new Error('DB connection failed'));

    const result = await resolveVehicle('BYD', 'Atto 3');
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.vehicle.id).toBe('byd-atto3');
    }
  });

  it('performs case-insensitive matching in fallback', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));

    const result = await resolveVehicle('vinfast', 'VF 3');
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.vehicle.brand).toBe('VinFast');
    }
  });

  it('handles partial model matching in fallback', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));

    const result = await resolveVehicle('VinFast', 'VF');
    expect(result.type).toBe('multiple');
    if (result.type === 'multiple') {
      expect(result.options.length).toBe(3); // VF 3, VF 8 Plus, VF 8 Eco
    }
  });

  it('handles brand-only search with null model', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));

    const result = await resolveVehicle('BYD', null);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.vehicle.id).toBe('byd-atto3');
    }
  });
});
