import { prisma } from '@/lib/prisma';
import { VIETNAM_MODELS } from '@/lib/vietnam-models';
import type { EVVehicleData } from '@/types';

export type VehicleResolution =
  | { readonly type: 'match'; readonly vehicle: EVVehicleData }
  | { readonly type: 'multiple'; readonly options: readonly EVVehicleData[] }
  | { readonly type: 'not_found' };

/** Normalize for fuzzy comparison: lowercase, collapse whitespace, strip non-alphanumeric */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, '');
}

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

  // Fallback: search VIETNAM_MODELS with normalized matching (handles "VF7" vs "VF 7")
  const normBrand = brand ? normalize(brand) : null;
  const normModel = model ? normalize(model) : null;

  const fallbackMatches = VIETNAM_MODELS.filter(v => {
    const brandMatch = !normBrand || normalize(v.brand).includes(normBrand);
    const modelNorm = normalize(v.model);
    const variantNorm = v.variant ? normalize(v.variant) : '';
    const fullModelNorm = modelNorm + variantNorm;
    const modelMatch = !normModel || modelNorm.includes(normModel) || fullModelNorm.includes(normModel);
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
