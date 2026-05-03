/**
 * OpenStreetMap Overpass tag parsers for EV charging stations in Vietnam.
 *
 * The OSM `amenity=charging_station` schema is heterogenous — operators tag
 * inconsistently (`operator`, `brand`, or `network`; English vs Vietnamese
 * spellings; abbreviations). These helpers normalize that into the small
 * set of provider strings the eVoyage API exposes, while preserving any
 * long-tail operator name we don't yet recognize.
 */

const PROVIDER_RULES: ReadonlyArray<{ match: ReadonlyArray<string>; provider: string; isVinFast: boolean }> = [
  { match: ['vinfast', 'v-green', 'vgreen', 'v green'], provider: 'VinFast', isVinFast: true },
  { match: ['eboost'], provider: 'EBOOST', isVinFast: false },
  { match: ['evn'], provider: 'EVN', isVinFast: false },
  { match: ['evone', 'ev one', 'ev-one'], provider: 'EV One', isVinFast: false },
  { match: ['evpower'], provider: 'EVPower', isVinFast: false },
  { match: ['evercharge'], provider: 'EverCharge', isVinFast: false },
  { match: ['charge+'], provider: 'CHARGE+', isVinFast: false },
  { match: ['porsche'], provider: 'Porsche', isVinFast: false },
  { match: ['bmw'], provider: 'BMW', isVinFast: false },
  { match: ['mercedes'], provider: 'Mercedes-Benz', isVinFast: false },
  { match: ['audi'], provider: 'Audi', isVinFast: false },
  { match: ['mitsubishi'], provider: 'Mitsubishi', isVinFast: false },
  { match: ['byd'], provider: 'BYD', isVinFast: false },
  { match: ['mg motor', 'mg ev', 'mg vietnam'], provider: 'MG', isVinFast: false },
  { match: ['pv power'], provider: 'PV Power', isVinFast: false },
  { match: ['pv oil'], provider: 'PV Oil', isVinFast: false },
  { match: ['petrolimex'], provider: 'Petrolimex', isVinFast: false },
  { match: ['solarev'], provider: 'SolarEV', isVinFast: false },
  { match: ['datcharge'], provider: 'DatCharge', isVinFast: false },
  { match: ['rabbit'], provider: 'Rabbit EVC', isVinFast: false },
  { match: ['vuphong'], provider: 'VuPhong', isVinFast: false },
  { match: ['autel'], provider: 'Autel', isVinFast: false },
];

export function parseOSMProvider(tags: Record<string, string>): {
  provider: string;
  isVinFast: boolean;
} {
  const raw = (tags['operator'] ?? tags['brand'] ?? tags['network'] ?? '').trim();
  if (!raw) return { provider: 'Other', isVinFast: false };
  const lower = raw.toLowerCase();
  for (const rule of PROVIDER_RULES) {
    if (rule.match.some((needle) => lower.includes(needle))) {
      return { provider: rule.provider, isVinFast: rule.isVinFast };
    }
  }
  return { provider: raw.slice(0, 50), isVinFast: false };
}

export function parseOSMConnectors(tags: Record<string, string>): string[] {
  const connectors: string[] = [];
  if (tags['socket:type2'] || tags['socket:type2_cable']) connectors.push('Type2_AC');
  if (tags['socket:type2_combo'] || tags['socket:ccs']) connectors.push('CCS2');
  if (tags['socket:chademo']) connectors.push('CHAdeMO');
  if (tags['socket:type1']) connectors.push('Type1');
  if (tags['socket:type1_combo']) connectors.push('CCS1');
  return connectors.length > 0 ? Array.from(new Set(connectors)) : ['Unknown'];
}

export function parseOSMMaxPower(tags: Record<string, string>): number {
  for (const key of ['charging_station:output', 'capacity', 'maxpower']) {
    const val = tags[key];
    if (val) {
      const num = parseFloat(val);
      if (!Number.isNaN(num) && num > 0) return num;
    }
  }
  for (const key of Object.keys(tags)) {
    if (key.startsWith('socket:') && key.endsWith(':output')) {
      const match = tags[key]?.match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return 22;
}
