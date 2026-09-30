import { getCachedRoute, setCachedRoute } from './route-cache';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    routeCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const mockFindUnique = prisma.routeCache.findUnique as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.routeCache.upsert as ReturnType<typeof vi.fn>;

const ROUTE = { polyline: 'abc', distanceMeters: 1000, durationSeconds: 60 };

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpsert.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getCachedRoute', () => {
  it('returns the cached route when a fresh row exists', async () => {
    mockFindUnique.mockResolvedValue({ ...ROUTE, createdAt: new Date() });

    const result = await getCachedRoute(21.02, 105.84, 10.77, 106.7, 'osrm');

    expect(result).toEqual(ROUTE);
  });

  it('returns null instead of throwing when the database read fails, so a cache outage cannot fail the trip request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFindUnique.mockRejectedValue(new Error('P2024: pool timeout'));

    await expect(getCachedRoute(21.02, 105.84, 10.77, 106.7, 'osrm')).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('setCachedRoute', () => {
  it('writes the route through to the database on the happy path', async () => {
    mockUpsert.mockResolvedValue({});

    await setCachedRoute(21.02, 105.84, 10.77, 106.7, 'osrm', ROUTE);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it('resolves instead of throwing when the database write fails, so an already-computed route is not discarded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockUpsert.mockRejectedValue(new Error('P2024: pool timeout'));

    await expect(setCachedRoute(21.02, 105.84, 10.77, 106.7, 'osrm', ROUTE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
