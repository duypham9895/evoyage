'use client';

import { useState, useCallback, useEffect } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { LocaleProvider } from '@/lib/locale';
import Header from '@/components/Header';
import TripInput from '@/components/TripInput';
import BrandModelSelector from '@/components/BrandModelSelector';
import AddCustomVehicle from '@/components/AddCustomVehicle';
import BatteryStatusPanel from '@/components/BatteryStatusPanel';
import TripSummary from '@/components/TripSummary';
import Map from '@/components/Map';
import type { EVVehicleData, CustomVehicleInput, TripPlan } from '@/types';
import {
  DEFAULT_RANGE_SAFETY_FACTOR,
  DEFAULT_CURRENT_BATTERY,
  DEFAULT_MIN_ARRIVAL,
} from '@/types';

export default function Home() {
  // Google Maps loading state
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Trip inputs
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // Vehicle
  const [selectedVehicle, setSelectedVehicle] = useState<EVVehicleData | null>(null);
  const [customVehicle, setCustomVehicle] = useState<CustomVehicleInput | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Battery
  const [currentBattery, setCurrentBattery] = useState(DEFAULT_CURRENT_BATTERY);
  const [minArrival, setMinArrival] = useState(DEFAULT_MIN_ARRIVAL);
  const [rangeSafetyFactor, setRangeSafetyFactor] = useState(DEFAULT_RANGE_SAFETY_FACTOR);

  // Trip result
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Google Maps API using functional API (v2)
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — map disabled');
      return;
    }

    setOptions({
      key: apiKey,
      v: 'weekly',
      language: 'vi',
      region: 'VN',
    });

    // Import both core maps and places libraries
    Promise.all([
      importLibrary('maps'),
      importLibrary('places'),
    ])
      .then(() => setMapsLoaded(true))
      .catch(console.error);
  }, []);

  // Load persisted state from localStorage
  useEffect(() => {
    const savedRSF = localStorage.getItem('ev-planner-rsf');
    if (savedRSF) {
      const val = parseFloat(savedRSF);
      if (!isNaN(val) && val >= 0.5 && val <= 1.0) {
        setRangeSafetyFactor(val);
      }
    }

    const savedCustom = localStorage.getItem('ev-planner-custom-vehicle');
    if (savedCustom) {
      try {
        setCustomVehicle(JSON.parse(savedCustom));
      } catch { /* ignore invalid data */ }
    }
  }, []);

  // Persist RSF to localStorage
  const handleRSFChange = useCallback((val: number) => {
    setRangeSafetyFactor(val);
    localStorage.setItem('ev-planner-rsf', val.toString());
  }, []);

  // Save custom vehicle
  const handleSaveCustomVehicle = useCallback((vehicle: CustomVehicleInput) => {
    setCustomVehicle(vehicle);
    setSelectedVehicle(null);
    localStorage.setItem('ev-planner-custom-vehicle', JSON.stringify(vehicle));
  }, []);

  // Select DB vehicle (clears custom)
  const handleSelectVehicle = useCallback((vehicle: EVVehicleData | null) => {
    setSelectedVehicle(vehicle);
    setCustomVehicle(null);
  }, []);

  // Plan trip — POST to /api/route
  const handlePlanTrip = useCallback(async () => {
    if (!start || !end) {
      setError('Please enter start and end locations');
      return;
    }
    if (!selectedVehicle && !customVehicle) {
      setError('Please select a vehicle');
      return;
    }

    setIsPlanning(true);
    setError(null);
    setTripPlan(null);

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start,
          end,
          vehicleId: selectedVehicle?.id ?? null,
          customVehicle: selectedVehicle ? null : customVehicle,
          currentBatteryPercent: currentBattery,
          minArrivalPercent: minArrival,
          rangeSafetyFactor,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Route calculation failed');
      }

      setTripPlan(data as TripPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsPlanning(false);
    }
  }, [start, end, selectedVehicle, customVehicle, currentBattery, minArrival, rangeSafetyFactor]);

  const activeVehicle = selectedVehicle ?? customVehicle;
  const canPlan = Boolean(start && end && activeVehicle && !isPlanning);

  return (
    <LocaleProvider>
      <div className="h-screen flex flex-col">
        <Header />

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Sidebar — inputs + summary */}
          <aside className="w-full lg:w-[380px] lg:min-w-[380px] overflow-y-auto bg-[var(--color-surface)] p-4 space-y-4 border-r border-[var(--color-surface-hover)]">
            <TripInput
              start={start}
              end={end}
              onStartChange={setStart}
              onEndChange={setEnd}
              isLoaded={mapsLoaded}
            />

            <BrandModelSelector
              selectedVehicle={selectedVehicle}
              onSelect={handleSelectVehicle}
              onCustomCarClick={() => setShowCustomForm(true)}
            />

            <BatteryStatusPanel
              vehicle={activeVehicle}
              currentBattery={currentBattery}
              minArrival={minArrival}
              rangeSafetyFactor={rangeSafetyFactor}
              onCurrentBatteryChange={setCurrentBattery}
              onMinArrivalChange={setMinArrival}
              onRangeSafetyFactorChange={handleRSFChange}
            />

            {/* Plan trip button */}
            <button
              onClick={handlePlanTrip}
              disabled={!canPlan}
              className={`w-full py-3 rounded-lg font-bold font-[family-name:var(--font-heading)] text-lg transition-all ${
                canPlan
                  ? 'bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98]'
                  : 'bg-[var(--color-surface-hover)] text-[var(--color-muted)] cursor-not-allowed'
              }`}
            >
              {isPlanning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[var(--color-background)] border-t-transparent rounded-full animate-spin" />
                  Planning...
                </span>
              ) : (
                'LÊN KẾ HOẠCH ⚡'
              )}
            </button>

            {/* Error display */}
            {error && (
              <div className="p-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Trip results */}
            <TripSummary tripPlan={tripPlan} isLoading={isPlanning} />
          </aside>

          {/* Map pane */}
          <main className="flex-1 relative min-h-[300px]">
            <Map tripPlan={tripPlan} isLoaded={mapsLoaded} />
          </main>
        </div>
      </div>

      {/* Custom vehicle modal */}
      <AddCustomVehicle
        isOpen={showCustomForm}
        onClose={() => setShowCustomForm(false)}
        onSave={handleSaveCustomVehicle}
      />
    </LocaleProvider>
  );
}
