import { prisma } from '@/lib/prisma';
import { VIETNAM_MODELS } from '@/lib/vietnam-models';
import type { EVVehicleData } from '@/types';

export type VehicleResolution =
  | { readonly type: 'match'; readonly vehicle: EVVehicleData }
  | { readonly type: 'multiple'; readonly options: readonly EVVehicleData[] }
  | { readonly type: 'not_found' };

export async function resolveVehicle(
  brand: string | null,
  model: string | null,
): Promise<VehicleResolution> {
  if (!brand && !model) return { type: 'not_found' };

  try {
    const vehicles = await prisma.eVVehicle.findMany({
      where: {
        ...(brand ? { brand: { contains: brand, mode: 'insensitive' as const } } : {}),
        ...(model ? { model: { contains: model, mode: 'insensitive' as const } } : {}),
        availableInVietnam: true,
      },
    });

    if (vehicles.length === 1) {
      return { type: 'match', vehicle: vehicles[0] as unknown as EVVehicleData };
    }
    if (vehicles.length > 1) {
      return { type: 'multiple', options: vehicles as unknown as EVVehicleData[] };
    }
  } catch {
    // DB failed — fallback to hardcoded models
  }

  // Fallback: search VIETNAM_MODELS
  const fallbackMatches = VIETNAM_MODELS.filter(v => {
    const brandMatch = !brand || v.brand.toLowerCase().includes(brand.toLowerCase());
    const modelMatch = !model || v.model.toLowerCase().includes(model.toLowerCase());
    return brandMatch && modelMatch;
  });

  if (fallbackMatches.length === 1) {
    return { type: 'match', vehicle: fallbackMatches[0] };
  }
  if (fallbackMatches.length > 1) {
    return { type: 'multiple', options: fallbackMatches };
  }

  return { type: 'not_found' };
}
