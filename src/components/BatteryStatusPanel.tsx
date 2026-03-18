'use client';

import { useState, useMemo } from 'react';
import { useLocale } from '@/lib/locale';
import { calculateUsableRange, getRangeSafetyWarning } from '@/lib/range-calculator';
import {
  DEFAULT_RANGE_SAFETY_FACTOR,
  CONFIRMATION_THRESHOLD,
} from '@/types';

interface VehicleForPanel {
  readonly brand: string;
  readonly model: string;
  readonly variant?: string | null;
  readonly officialRangeKm: number;
}

interface BatteryStatusPanelProps {
  readonly vehicle: VehicleForPanel | null;
  readonly currentBattery: number;
  readonly minArrival: number;
  readonly rangeSafetyFactor: number;
  readonly onCurrentBatteryChange: (value: number) => void;
  readonly onMinArrivalChange: (value: number) => void;
  readonly onRangeSafetyFactorChange: (value: number) => void;
}

const BATTERY_QUICK_SELECT = [50, 60, 70, 80, 90, 100] as const;
const RSF_QUICK_SELECT = [0.60, 0.70, 0.80, 0.90, 1.00] as const;

/** Returns inline style for a filled slider track gradient */
function sliderFillStyle(value: number, min: number, max: number): React.CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${pct}%, var(--color-surface-hover) ${pct}%, var(--color-surface-hover) 100%)`,
  };
}

export default function BatteryStatusPanel({
  vehicle,
  currentBattery,
  minArrival,
  rangeSafetyFactor,
  onCurrentBatteryChange,
  onMinArrivalChange,
  onRangeSafetyFactorChange,
}: BatteryStatusPanelProps) {
  const { t } = useLocale();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingRSF, setPendingRSF] = useState<number | null>(null);

  const vehicleForCalc = vehicle
    ? {
        brand: vehicle.brand,
        model: vehicle.model,
        variant: vehicle.variant ?? null,
        officialRangeKm: vehicle.officialRangeKm,
      }
    : null;

  const rangeResult = useMemo(() => {
    if (!vehicleForCalc) return null;
    return calculateUsableRange(vehicleForCalc, currentBattery, minArrival, rangeSafetyFactor);
  }, [vehicleForCalc, currentBattery, minArrival, rangeSafetyFactor]);

  const warning = useMemo(() => getRangeSafetyWarning(rangeSafetyFactor), [rangeSafetyFactor]);

  const vehicleName = vehicleForCalc
    ? vehicleForCalc.variant
      ? `${vehicleForCalc.brand} ${vehicleForCalc.model} ${vehicleForCalc.variant}`
      : `${vehicleForCalc.brand} ${vehicleForCalc.model}`
    : null;

  const handleRSFChange = (newValue: number) => {
    if (newValue >= CONFIRMATION_THRESHOLD) {
      setPendingRSF(newValue);
      setShowConfirmDialog(true);
    } else {
      onRangeSafetyFactorChange(newValue);
    }
  };

  const confirmRSF = () => {
    if (pendingRSF !== null) {
      onRangeSafetyFactorChange(pendingRSF);
    }
    setShowConfirmDialog(false);
    setPendingRSF(null);
  };

  const resetRSF = () => {
    onRangeSafetyFactorChange(DEFAULT_RANGE_SAFETY_FACTOR);
    setShowConfirmDialog(false);
    setPendingRSF(null);
  };

  const warningBorderColor =
    warning.level === 'danger'
      ? 'border-[var(--color-danger)]'
      : warning.level === 'warning'
        ? 'border-[var(--color-warn)]'
        : 'border-[var(--color-surface-hover)]';

  return (
    <div className={`space-y-4 p-3 rounded-lg bg-[var(--color-background)] border ${warningBorderColor} transition-colors`}>
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {t('Pin hiện tại', 'Current Battery')}
      </h2>

      {/* Current battery slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--color-muted)]">
            {t('Pin hiện tại', 'Current battery')}
          </label>
          <span className="text-lg font-bold font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
            {currentBattery}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={currentBattery}
          onChange={(e) => onCurrentBatteryChange(parseInt(e.target.value, 10))}
          className="w-full"
          style={sliderFillStyle(currentBattery, 10, 100)}
        />
        <div className="flex gap-1 mt-2">
          {BATTERY_QUICK_SELECT.map((val) => (
            <button
              key={val}
              onClick={() => onCurrentBatteryChange(val)}
              className={`flex-1 py-1 text-xs rounded transition-colors ${
                currentBattery === val
                  ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold'
                  : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>

      {/* Min arrival slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--color-muted)]">
            {t('Pin tối thiểu khi đến', 'Min arrival battery')}
          </label>
          <span className="text-sm font-[family-name:var(--font-mono)] text-[var(--color-muted)]">
            {minArrival}%
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={30}
          step={5}
          value={minArrival}
          onChange={(e) => onMinArrivalChange(parseInt(e.target.value, 10))}
          className="w-full"
          style={sliderFillStyle(minArrival, 5, 30)}
        />
      </div>

      {/* Live range readout */}
      {rangeResult && vehicleName && (
        <div className="p-3 bg-[var(--color-surface)] rounded-lg">
          <div className="text-xs text-[var(--color-muted)] mb-1">
            {t('Quãng đường khả dụng', 'Usable range')}
          </div>
          <div className="text-2xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
            ~{Math.round(rangeResult.usableRangeKm)} km
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-1">
            {t(
              `${vehicleName} tại ${currentBattery}% pin`,
              `${vehicleName} at ${currentBattery}% battery`,
            )}
          </div>
        </div>
      )}

      {/* Advanced: Range Safety Factor */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors flex items-center gap-1"
        >
          <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
            ▶
          </span>
          {t('Hệ số an toàn quãng đường', 'Range Safety Factor')}
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-muted)]">
                {t(
                  `Bạn tin tưởng ${Math.round(rangeSafetyFactor * 100)}% quãng đường công bố`,
                  `You trust ${Math.round(rangeSafetyFactor * 100)}% of claimed range`,
                )}
              </span>
              <span className="text-sm font-bold font-[family-name:var(--font-mono)]">
                {Math.round(rangeSafetyFactor * 100)}%
              </span>
            </div>

            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={Math.round(rangeSafetyFactor * 100)}
              onChange={(e) => handleRSFChange(parseInt(e.target.value, 10) / 100)}
              className="w-full"
              style={sliderFillStyle(Math.round(rangeSafetyFactor * 100), 50, 100)}
            />

            <div className="flex gap-1">
              {RSF_QUICK_SELECT.map((val) => (
                <button
                  key={val}
                  onClick={() => handleRSFChange(val)}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    rangeSafetyFactor === val
                      ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  {Math.round(val * 100)}%
                </button>
              ))}
            </div>

            {/* Warning message */}
            <div
              className={`p-3 rounded-lg text-xs leading-relaxed transition-all ${
                warning.color === 'green'
                  ? 'bg-[var(--color-safe)]/10 text-[var(--color-safe)]'
                  : warning.color === 'orange'
                    ? 'bg-[var(--color-warn)]/10 text-[var(--color-warn)]'
                    : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
              }`}
            >
              <div>{t(warning.messageVi, warning.messageEn)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation dialog for 95%+ RSF */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--color-surface)] rounded-xl p-6 max-w-sm w-full shadow-2xl border border-[var(--color-danger)]/30">
            <h3 className="text-lg font-bold font-[family-name:var(--font-heading)] text-[var(--color-danger)] mb-3">
              {t(
                '⚠️ Xác nhận mức rủi ro cao',
                '⚠️ Confirm high risk level',
              )}
            </h3>
            <p className="text-sm text-[var(--color-foreground)] mb-4 leading-relaxed">
              {t(
                `Với hệ số ${Math.round((pendingRSF ?? 0.95) * 100)}%, quãng đường tính toán gần bằng quãng đường nhà sản xuất. Điều này cực kỳ không thực tế trong điều kiện lái thực tế tại Việt Nam (nóng, bật A/C, giao thông đông).`,
                `At ${Math.round((pendingRSF ?? 0.95) * 100)}% factor, the calculated range nearly equals the manufacturer's figure. This is extremely unrealistic under real Vietnamese driving conditions (heat, AC usage, traffic).`,
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={resetRSF}
                className="flex-1 px-4 py-2 text-sm bg-[var(--color-accent)] text-[var(--color-background)] rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                {t('Quay về 80%', 'Reset to 80%')}
              </button>
              <button
                onClick={confirmRSF}
                className="flex-1 px-4 py-2 text-sm border border-[var(--color-danger)] text-[var(--color-danger)] rounded-lg hover:bg-[var(--color-danger)]/10 transition-colors"
              >
                {t('Tôi hiểu rủi ro', 'I understand the risk')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
