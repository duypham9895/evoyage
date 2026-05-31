import { CHARGE_TARGET_PERCENT } from '@/types';
import type { ChargingDecisionPoint } from './route-planner';

interface VehicleBatteryCapacity {
  readonly batteryCapacityKwh: number;
}

export function topUpTargetForVehicle(batteryCapacityKwh: number): number {
  if (batteryCapacityKwh >= 80) return 60;
  if (batteryCapacityKwh >= 60) return 65;
  if (batteryCapacityKwh >= 40) return 70;
  return 75;
}

export function chargeTargetForDecisionPoint(
  decisionPoint: Pick<ChargingDecisionPoint, 'isPrecautionary'>,
  vehicle: VehicleBatteryCapacity,
): number {
  return decisionPoint.isPrecautionary === true
    ? topUpTargetForVehicle(vehicle.batteryCapacityKwh)
    : CHARGE_TARGET_PERCENT;
}
