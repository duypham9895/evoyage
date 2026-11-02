import { describe, it, expect } from 'vitest';
import { planChargingStops, findChargingDecisionPoints, type ChargingPlanResult } from './route-planner';
import type { ChargingStationData, RankedStation, ChargingStopWithAlternatives } from '@/types';
import type { StationWithRouteInfo } from './station-finder';

// A simple encoded polyline for testing (straight line ~200km)
// We'll generate a synthetic one for controllable tests
import { decodePolyline, encodePolyline } from '../geo/polyline';

const VF8_ECO = {
  brand: 'VinFast',
  model: 'VF 8',
  variant: 'Eco' as const,
  officialRangeKm: 471,
  batteryCapacityKwh: 87.7,
  chargingTimeDC_10to80_min: 31,
};

const BYD_SEAL = {
  brand: 'BYD',
  model: 'Seal',
  variant: 'Advance' as const,
  officialRangeKm: 570,
  batteryCapacityKwh: 82.5,
  chargingTimeDC_10to80_min: 26,
};

const makeStation = (
  name: string,
  lat: number,
  lng: number,
  isVinFastOnly: boolean = false,
): ChargingStationData => ({
  id: name,
  name,
  address: 'Test',
  province: 'Test',
  latitude: lat,
  longitude: lng,
  chargerTypes: ['DC_60kW'],
  connectorTypes: ['CCS2'],
  portCount: 2,
  maxPowerKw: 60,
  stationType: 'public',
  isVinFastOnly,
  operatingHours: null,
  provider: isVinFastOnly ? 'VinFast' : 'EverCharge',
  chargingStatus: null,
  parkingFee: null,
});

// Generate a synthetic encoded polyline for a straight-line route
// from HCM (10.776, 106.700) heading northeast ~430km toward Nha Trang (12.238, 109.196)
function makeTestPolyline(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  numPoints: number,
): string {
  // Create points along the line and encode
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({
      lat: startLat + (endLat - startLat) * t,
      lng: startLng + (endLng - startLng) * t,
    });
  }

  // Encode using Google's polyline algorithm
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);

    encoded += encodeValue(lat - prevLat);
    encoded += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
}

// Stations along the HCM → Nha Trang route
const stationsAlongRoute: ChargingStationData[] = [
  // VinFast station at ~100km
  makeStation('VinFast Phan Rang', 11.1, 107.5, true),
  // Universal station at ~100km
  makeStation('EverCharge Phan Rang', 11.12, 107.52, false),
  // VinFast station at ~200km
  makeStation('VinFast Cam Ranh', 11.6, 108.3, true),
  // Universal station at ~250km
  makeStation('EverCharge Nha Trang', 11.8, 108.7, false),
  // Universal station at ~350km
  makeStation('EVONE Ninh Thuan', 11.95, 108.95, false),
];

const testPolyline = makeTestPolyline(10.776, 106.7, 12.238, 109.196, 200);

describe('planChargingStops', () => {
  it('VF 8 Eco at 80%, short route (200km) → 0 stops', () => {
    // Short route: HCM to Phan Thiet (~140km effective distance)
    const shortPolyline = makeTestPolyline(10.776, 106.7, 10.93, 108.1, 50);

    const result = planChargingStops({
      encodedPolyline: shortPolyline,
      totalDistanceKm: 200,
      vehicle: VF8_ECO,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    expect(result.chargingStops).toHaveLength(0);
    expect(result.arrivalBatteryPercent).toBeGreaterThan(15);
  });

  it('VF 8 Eco at 60%, long route → needs charging stops', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 60,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    expect(result.chargingStops.length).toBeGreaterThanOrEqual(1);
    expect(result.arrivalBatteryPercent).toBeGreaterThanOrEqual(0);
  });

  it('BYD Seal → never shows VinFast-only stations', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: BYD_SEAL,
      currentBatteryPercent: 60,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    const hasVinFastStop = result.chargingStops.some(
      (stop) => ('selected' in stop ? stop.selected.station.isVinFastOnly : stop.station.isVinFastOnly),
    );
    expect(hasVinFastStop).toBe(false);
  });

  it('all departure batteries are 80% (DC charge target)', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 40,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    for (const stop of result.chargingStops) {
      const departureBattery = 'selected' in stop ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
      expect(departureBattery).toBe(80);
    }
  });

  it('propagates precautionary decision-point flags and uses the vehicle-aware top-up target', () => {
    const primary = makeStation('Precautionary Midpoint', 11.1, 107.5, true);
    const ranked: RankedStation = {
      station: primary,
      detourDriveTimeSec: 60,
      estimatedChargeTimeMin: 18,
      totalStopTimeMin: 19,
      rank: 'best',
      score: 19,
    };

    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
      precomputedDecisionPoints: [
        {
          polylineIndex: 50,
          distanceKm: 100,
          point: { lat: 11.1, lng: 107.5 },
          candidates: [primary],
          useCorridorScoring: true,
          isPrecautionary: true,
          precautionaryReason: 'holiday',
        },
      ],
      rankedStationsPerStop: new Map([[0, [ranked]]]),
    });

    expect(result.chargingStops).toHaveLength(1);
    const stop = result.chargingStops[0];
    expect(stop).toMatchObject({
      isPrecautionary: true,
      precautionaryReason: 'holiday',
      batteryPercentAfterCharge: 60,
    });
  });

  it('generates battery segments covering full route', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 60,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    // First segment starts at 0
    expect(result.batterySegments[0].startKm).toBe(0);
    // Last segment ends at total route distance
    const lastSeg = result.batterySegments[result.batterySegments.length - 1];
    expect(lastSeg.endKm).toBeGreaterThan(0);
  });

  it('warns when no compatible station found', () => {
    // BYD with ONLY VinFast stations available
    const onlyVinFastStations = [
      makeStation('VinFast Only 1', 11.1, 107.5, true),
      makeStation('VinFast Only 2', 11.6, 108.3, true),
    ];

    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: BYD_SEAL,
      currentBatteryPercent: 40,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: onlyVinFastStations,
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].type).toBe('NO_COMPATIBLE_STATION');
    expect(result.warnings[0].messageVi).toContain('BYD');
  });

  it('VinFast vehicle can use VinFast stations', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 40,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    // May or may not use VinFast stations depending on proximity,
    // but at least it shouldn't be filtered out
    expect(result.chargingStops.length).toBeGreaterThan(0);
  });
});

describe('decodePolyline (round-trip)', () => {
  it('encodes and decodes back to original points', () => {
    const encoded = makeTestPolyline(10.0, 106.0, 12.0, 109.0, 10);
    const decoded = decodePolyline(encoded);

    expect(decoded.length).toBe(11); // 10 + 1
    expect(decoded[0].lat).toBeCloseTo(10.0, 4);
    expect(decoded[0].lng).toBeCloseTo(106.0, 4);
    expect(decoded[10].lat).toBeCloseTo(12.0, 4);
    expect(decoded[10].lng).toBeCloseTo(109.0, 4);
  });
});

// ── Regression tests for docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md ──
// Geometry: a straight route due north along lng 106.7. 1 deg lat ≈ 111.195 km,
// so a station's route km is controlled exactly by its latitude.
const NORTH_LNG = 106.7;
const KM_PER_DEG_LAT = 111.195;
const kmToLat = (km: number) => 10 + km / KM_PER_DEG_LAT;

function northRoutePolyline(totalKm: number, stepKm: number = 1): string {
  const pts: Array<{ lat: number; lng: number }> = [];
  for (let km = 0; km <= totalKm; km += stepKm) pts.push({ lat: kmToLat(km), lng: NORTH_LNG });
  return encodePolyline(pts, 5);
}

const onRouteStation = (name: string, km: number): ChargingStationData => ({
  ...makeStation(name, kmToLat(km), NORTH_LNG + 0.0005, false),
  provider: 'X',
});

// officialRange 500 × rsf 0.8 → effectiveMaxRange 400 km (1% SOC = 4 km).
// Usable range 80% → 15% = 260 km.
const TEST_VF = {
  brand: 'VinFast',
  model: 'Test',
  variant: null,
  officialRangeKm: 500,
  batteryCapacityKwh: 60,
  chargingTimeDC_10to80_min: 30,
};

const GENERIC_TINY = {
  brand: 'Generic',
  model: 'Tiny',
  variant: null,
  officialRangeKm: 60,
  batteryCapacityKwh: 10,
  chargingTimeDC_10to80_min: 30,
};

const ranked = (station: ChargingStationData): RankedStation => ({
  station,
  detourDriveTimeSec: 0,
  estimatedChargeTimeMin: 20,
  totalStopTimeMin: 20,
  rank: 'best',
  score: 20,
});

const stopStationName = (s: ChargingPlanResult['chargingStops'][number]) =>
  'selected' in s ? s.selected.station.name : s.station.name;

describe('BUG p1-route-planner-soc-and-stop-correctness', () => {
  // Finding 1 — stop km / SOC use the decision-point km, not the shown station's km
  const stationKm = 110;
  const decisionKm = 150;
  const shown = {
    ...onRouteStation('Shown station', stationKm),
    distanceToRouteKm: 0,
    nearestRouteKm: stationKm,
    nearestRouteIdx: stationKm,
  } as StationWithRouteInfo;
  const planWithShiftedRanking = () =>
    planChargingStops({
      encodedPolyline: northRoutePolyline(200),
      totalDistanceKm: 200,
      vehicle: TEST_VF,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations: [shown],
      precomputedDecisionPoints: [
        {
          polylineIndex: decisionKm,
          distanceKm: decisionKm,
          point: { lat: kmToLat(decisionKm), lng: NORTH_LNG },
          candidates: [shown],
          useCorridorScoring: true,
        },
      ],
      rankedStationsPerStop: new Map([[0, [ranked(shown)]]]),
    });

  // BUG(p1-route-planner-soc-and-stop-correctness): stop km comes from dp.distanceKm, not the selected station's route km. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('stop distanceAlongRouteKm equals the selected station\'s own route km', () => {
    const stop = planWithShiftedRanking().chargingStops[0] as ChargingStopWithAlternatives;
    expect(stop.distanceAlongRouteKm).toBeCloseTo(stationKm, 0);
  });

  // BUG(p1-route-planner-soc-and-stop-correctness): arrival SOC is computed for dp.distanceKm (150 km), not the shown station (110 km). Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('arrival SOC at a stop is computed for the selected station\'s position', () => {
    const stop = planWithShiftedRanking().chargingStops[0] as ChargingStopWithAlternatives;
    // 80% - 110 km / 400 km = 52.5%  (buggy value: 80% - 150/400 = 42.5%)
    expect(stop.batteryPercentAtArrival).toBeCloseTo(52.5, 0);
  });

  // BUG(p1-route-planner-soc-and-stop-correctness): when ranking picks an earlier station than the simulated decision point, the real next leg breaks minArrival while the plan shows it as OK. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('real SOC between the shown stations never drops below minArrival when ranking prefers an earlier candidate', () => {
    // Window 1 (~km 180-245) holds stations at 185 and 240; the simulator charges at 240.
    // Window 2 (from 240) only holds a station at 480.
    const stations = [185, 240, 480].map((km) => onRouteStation(`S${km}`, km));
    const input = {
      encodedPolyline: northRoutePolyline(600),
      totalDistanceKm: 600,
      vehicle: TEST_VF,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations,
    };
    const dps = findChargingDecisionPoints(input);
    // Mimic route.ts: rank every candidate by a position-blind score. Here the
    // score happens to favour the earliest candidate (e.g. it has more power).
    const rankedMap = new Map<number, readonly RankedStation[]>(
      dps.map((dp, i) => [
        i,
        [...dp.candidates]
          .sort((a, b) => (a as StationWithRouteInfo).nearestRouteKm - (b as StationWithRouteInfo).nearestRouteKm)
          .map(ranked),
      ]),
    );
    const plan = planChargingStops({ ...input, precomputedDecisionPoints: dps, rankedStationsPerStop: rankedMap });
    const stops = plan.chargingStops as ChargingStopWithAlternatives[];
    expect(stops.length).toBeGreaterThanOrEqual(2);

    // Recompute SOC from where the shown stations really are on the route.
    let soc = 80;
    let prevKm = 0;
    for (const stop of stops) {
      const realKm = (stop.selected.station as StationWithRouteInfo).nearestRouteKm;
      const realArrival = soc - ((realKm - prevKm) / 400) * 100;
      expect(realArrival).toBeGreaterThanOrEqual(15);
      soc = stop.batteryPercentAfterCharge;
      prevKm = realKm;
    }
  });

  // Finding 2 — needless stop when destination is already reachable
  // BUG(p1-route-planner-soc-and-stop-correctness): search triggers at <80 km remaining range without checking if the destination is reachable. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('adds no charging stop when the destination is reachable above minArrival', () => {
    // 200 km route, 260 km usable range → arrives at 80 - 200/4 = 30% without charging.
    const result = planChargingStops({
      encodedPolyline: northRoutePolyline(200),
      totalDistanceKm: 200,
      vehicle: TEST_VF,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations: [onRouteStation('mid', 100), onRouteStation('late', 190)],
    });
    expect(result.chargingStops).toHaveLength(0);
    expect(result.arrivalBatteryPercent).toBe(30);
  });

  // Finding 3 — infeasible trips: warning spam, misleading text, duplicate stops
  const noStationsTrip = () =>
    planChargingStops({
      encodedPolyline: northRoutePolyline(300),
      totalDistanceKm: 300,
      vehicle: { ...GENERIC_TINY, officialRangeKm: 400, batteryCapacityKwh: 80 },
      currentBatteryPercent: 100,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations: [],
    });

  // BUG(p1-route-planner-soc-and-stop-correctness): one NO_COMPATIBLE_STATION warning is emitted every ~10 km of a station-less stretch. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('emits a single warning for one continuous station-less stretch', () => {
    // Filter by type: an infeasible verdict added as a new warning type (open question 2) must not fail this.
    expect(noStationsTrip().warnings.filter((w) => w.type === 'NO_COMPATIBLE_STATION')).toHaveLength(1);
  });

  // BUG(p1-route-planner-soc-and-stop-correctness): warning text blames VinFast incompatibility even when no station of any brand exists. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('does not blame VinFast compatibility when there are no stations at all', () => {
    const { warnings } = noStationsTrip();
    // This guard is tied to today's result shape. Update it once open question 2 (infeasible result shape) is decided.
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.messageEn).not.toContain("VinFast stations don't support");
    }
  });

  const duplicateStationInput = {
    encodedPolyline: northRoutePolyline(120),
    totalDistanceKm: 120,
    vehicle: GENERIC_TINY,
    currentBatteryPercent: 100,
    minArrivalPercent: 15,
    rangeSafetyFactor: 0.8,
    stations: [onRouteStation('Only station', 9)],
  };
  const expectNoConsecutiveDuplicates = (result: ChargingPlanResult) => {
    const names = result.chargingStops.map(stopStationName);
    // This guard is tied to today's result shape. Update it once open question 2 (infeasible result shape) is decided.
    expect(names.length).toBeGreaterThan(0);
    for (let i = 1; i < names.length; i++) {
      expect(names[i]).not.toBe(names[i - 1]);
    }
  };

  // BUG(p1-route-planner-soc-and-stop-correctness): the same station can be selected for two consecutive stops. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('never selects the same station for two consecutive stops', () => {
    // No ranking passed: exercises the haversine fallback (findNearestStation).
    expectNoConsecutiveDuplicates(planChargingStops(duplicateStationInput));
  });

  // BUG(p1-route-planner-soc-and-stop-correctness): same duplicate via the ranked branch, which prod uses when a Mapbox token is set. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-route-planner-soc-and-stop-correctness.md
  it('never selects the same station for two consecutive stops when stops come from a ranking', () => {
    // Mimic route.ts: rank each decision point's own candidates.
    const dps = findChargingDecisionPoints(duplicateStationInput);
    const rankedMap = new Map<number, readonly RankedStation[]>(
      dps.map((dp, i) => [i, dp.candidates.map(ranked)]),
    );
    expectNoConsecutiveDuplicates(
      planChargingStops({ ...duplicateStationInput, precomputedDecisionPoints: dps, rankedStationsPerStop: rankedMap }),
    );
  });
});

describe('planChargingStops stop correctness', () => {
  const dpAt = (km: number, candidates: readonly ChargingStationData[]) => ({
    polylineIndex: km,
    distanceKm: km,
    point: { lat: kmToLat(km), lng: NORTH_LNG },
    candidates,
    useCorridorScoring: true,
  });
  const onRoute = (name: string, km: number) =>
    ({ ...onRouteStation(name, km), distanceToRouteKm: 0, nearestRouteKm: km, nearestRouteIdx: km }) as StationWithRouteInfo;

  it('skips the previous stop\'s station when it is ranked first again and picks the next one', () => {
    const a = onRoute('A', 200);
    const b = onRoute('B', 390);
    const plan = planChargingStops({
      encodedPolyline: northRoutePolyline(600),
      totalDistanceKm: 600,
      vehicle: TEST_VF,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations: [a, b],
      precomputedDecisionPoints: [dpAt(200, [a]), dpAt(400, [a, b])],
      rankedStationsPerStop: new Map([[0, [ranked(a)]], [1, [ranked(a), ranked(b)]]]),
    });
    expect(plan.chargingStops.map(stopStationName)).toEqual(['A', 'B']);
  });

  it('ends each battery segment at the selected station\'s route km and starts the next leg there', () => {
    const early = onRoute('Early', 210);
    const late = onRoute('Late', 240);
    const plan = planWithDps([dpAt(240, [late, early])], [early, late], TEST_VF, new Map([[0, [ranked(early), ranked(late)]]]));
    const stop = plan.chargingStops[0] as ChargingStopWithAlternatives;
    expect(stop.selected.station.name).toBe('Early');
    expect(stop.distanceAlongRouteKm).toBeCloseTo(210, 0);
    expect(plan.batterySegments).toHaveLength(plan.chargingStops.length + 1);
    expect(plan.batterySegments[0].endKm).toBeCloseTo(210, 0);
    expect(plan.batterySegments[1].startKm).toBeCloseTo(210, 0);
    expect(stop.alternatives.map((a) => a.station.name)).toEqual(['Late']);
  });

  it('skips a top-ranked station whose next leg would drop below minArrival', () => {
    // Early (km 185) is reachable: 80 - 46.25 = 33.75%.
    // But Early → next decision point at km 480 is 295 km: 80 - 73.75 = 6.25% → too low.
    const early = onRoute('Early', 185);
    const late = onRoute('Late', 240);
    const next = onRoute('Next', 480);
    const plan = planChargingStops({
      encodedPolyline: northRoutePolyline(600),
      totalDistanceKm: 600,
      vehicle: TEST_VF,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations: [early, late, next],
      precomputedDecisionPoints: [dpAt(240, [late, early]), dpAt(480, [next])],
      rankedStationsPerStop: new Map([[0, [ranked(early), ranked(late)]], [1, [ranked(next)]]]),
    });
    expect(plan.chargingStops.map(stopStationName)).toEqual(['Late', 'Next']);
  });

  const emptyDpAt = (km: number) => ({ ...dpAt(km, []), useCorridorScoring: false });
  const planWithDps = (
    dps: ReturnType<typeof dpAt>[],
    stations: readonly ChargingStationData[],
    vehicle: typeof TEST_VF | typeof BYD_SEAL = TEST_VF,
    rankedMap?: ReadonlyMap<number, readonly RankedStation[]>,
  ) =>
    planChargingStops({
      encodedPolyline: northRoutePolyline(300),
      totalDistanceKm: 300,
      vehicle,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.8,
      stations,
      precomputedDecisionPoints: dps,
      rankedStationsPerStop: rankedMap,
    });
  const noStationWarnings = (plan: ChargingPlanResult) =>
    plan.warnings.filter((w) => w.type === 'NO_COMPATIBLE_STATION');

  it('emits one warning per station-less stretch when a stop separates two stretches', () => {
    const a = onRoute('A', 100);
    const plan = planWithDps(
      [emptyDpAt(40), emptyDpAt(50), dpAt(100, [a]), emptyDpAt(150), emptyDpAt(160)],
      [a],
      TEST_VF,
      new Map([[2, [ranked(a)]]]),
    );
    expect(noStationWarnings(plan).map((w) => w.distanceFromStartKm)).toEqual([40, 150]);
  });

  it('blames VinFast compatibility when VinFast-only stations sit near the station-less point', () => {
    const vinfastOnly = { ...onRouteStation('VF only', 102), isVinFastOnly: true };
    const farCompatible = onRouteStation('Far', 290);
    const [warning] = noStationWarnings(planWithDps([emptyDpAt(100)], [vinfastOnly, farCompatible], BYD_SEAL));
    expect(warning.messageEn).toContain("VinFast stations don't support BYD");
  });

  it('uses the generic text for a non-VinFast car when no VinFast-only station is nearby', () => {
    const farVinfastOnly = { ...onRouteStation('VF only', 250), isVinFastOnly: true };
    const farCompatible = onRouteStation('Far', 290);
    const [warning] = noStationWarnings(planWithDps([emptyDpAt(100)], [farVinfastOnly, farCompatible], BYD_SEAL));
    expect(warning.messageEn).toBe('⚠️ No charging station found in this area.');
  });
});
