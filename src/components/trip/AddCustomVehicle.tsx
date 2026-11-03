'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import Dialog from '@/components/ui/Dialog';
import type { CustomVehicleInput } from '@/types';

interface AddCustomVehicleProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (vehicle: CustomVehicleInput) => void;
}

export default function AddCustomVehicle({
  isOpen,
  onClose,
  onSave,
}: AddCustomVehicleProps) {
  const { t } = useLocale();
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState('');
  const [officialRangeKm, setOfficialRangeKm] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const battery = parseFloat(batteryCapacityKwh);
    const range = parseFloat(officialRangeKm);

    if (!brand || !model || isNaN(battery) || isNaN(range) || battery <= 0 || range <= 0) {
      return;
    }

    onSave({
      brand,
      model,
      batteryCapacityKwh: battery,
      officialRangeKm: range,
    });

    setBrand('');
    setModel('');
    setBatteryCapacityKwh('');
    setOfficialRangeKm('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} title={t('add_vehicle')}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
            {t('brand')}
          </label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Tesla, Hyundai, Mercedes..."
            required
            maxLength={100}
            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
            {t('model')}
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model 3 Long Range, Ioniq 5..."
            required
            maxLength={100}
            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
            {t('battery_capacity')}
          </label>
          <input
            type="number"
            value={batteryCapacityKwh}
            onChange={(e) => setBatteryCapacityKwh(e.target.value)}
            placeholder="60, 75, 82.5..."
            required
            min={1}
            step={0.1}
            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] font-[family-name:var(--font-mono)]"
          />
        </div>

        <div>
          <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
            {t('official_range')}
          </label>
          <input
            type="number"
            value={officialRangeKm}
            onChange={(e) => setOfficialRangeKm(e.target.value)}
            placeholder="400, 500, 600..."
            required
            min={1}
            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] font-[family-name:var(--font-mono)]"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-[var(--color-surface-hover)] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 text-sm bg-[var(--color-accent)] text-[var(--color-background)] rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            {t('save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
