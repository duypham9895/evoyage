import { describe, expect, it } from 'vitest';
import {
  parseOSMConnectors,
  parseOSMMaxPower,
  parseOSMProvider,
} from './parse-osm';

describe('parseOSMProvider', () => {
  it('matches VinFast and V-Green via several operator-tag spellings', () => {
    expect(parseOSMProvider({ operator: 'VinFast' })).toEqual({ provider: 'VinFast', isVinFast: true });
    expect(parseOSMProvider({ brand: 'V-GREEN' })).toEqual({ provider: 'VinFast', isVinFast: true });
    expect(parseOSMProvider({ network: 'vgreen' })).toEqual({ provider: 'VinFast', isVinFast: true });
  });

  it.each([
    ['EBOOST', 'EBOOST'],
    ['Eboost Vietnam', 'EBOOST'],
    ['EVN Hanoi', 'EVN'],
    ['EV One Energy', 'EV One'],
    ['EVPower', 'EVPower'],
    ['EverCharge', 'EverCharge'],
    ['CHARGE+', 'CHARGE+'],
    ['Porsche Destination Charging', 'Porsche'],
    ['BMW Vietnam', 'BMW'],
    ['Mercedes-Benz', 'Mercedes-Benz'],
    ['Audi Vietnam', 'Audi'],
    ['Mitsubishi Motors', 'Mitsubishi'],
    ['BYD', 'BYD'],
    ['MG Motor', 'MG'],
    ['PV Power', 'PV Power'],
    ['PV Oil', 'PV Oil'],
    ['Petrolimex', 'Petrolimex'],
    ['SolarEV', 'SolarEV'],
    ['DatCharge', 'DatCharge'],
    ['Rabbit EVC', 'Rabbit EVC'],
    ['VuPhong Energy', 'VuPhong'],
    ['Autel', 'Autel'],
  ])('recognizes operator "%s" as %s', (operator, expected) => {
    expect(parseOSMProvider({ operator })).toEqual({ provider: expected, isVinFast: false });
  });

  it('preserves the long-tail operator name (truncated to 50 chars) when no match', () => {
    expect(parseOSMProvider({ operator: 'Some Random Local Cafe Charger' })).toEqual({
      provider: 'Some Random Local Cafe Charger',
      isVinFast: false,
    });
  });

  it('falls back to "Other" only when no operator/brand/network tag exists', () => {
    expect(parseOSMProvider({})).toEqual({ provider: 'Other', isVinFast: false });
    expect(parseOSMProvider({ name: 'Some Place' })).toEqual({ provider: 'Other', isVinFast: false });
  });
});

describe('parseOSMConnectors', () => {
  it('reads socket:type2 / type2_combo / chademo tags', () => {
    expect(parseOSMConnectors({ 'socket:type2': '2' })).toContain('Type2_AC');
    expect(parseOSMConnectors({ 'socket:type2_combo': '1' })).toContain('CCS2');
    expect(parseOSMConnectors({ 'socket:chademo': '1' })).toContain('CHAdeMO');
  });

  it('returns ["Unknown"] when no socket info is present', () => {
    expect(parseOSMConnectors({})).toEqual(['Unknown']);
  });
});

describe('parseOSMMaxPower', () => {
  it('reads numeric output from charging_station:output', () => {
    expect(parseOSMMaxPower({ 'charging_station:output': '60' })).toBe(60);
  });

  it('reads socket-specific :output keys', () => {
    expect(parseOSMMaxPower({ 'socket:type2_combo:output': '120 kW' })).toBe(120);
  });

  it('defaults to 22 when nothing is parseable', () => {
    expect(parseOSMMaxPower({})).toBe(22);
  });
});
