import { describe, expect, it } from 'vitest';
import {
  evpowerStationKey,
  parseConnectorsAndPower,
  parseEVPowerStation,
  parseProvinceFromAddress,
} from './parse-evpower';
import sampleStations from '../../../scripts/__fixtures__/evpower-loadmap-sample.json';

describe('parseConnectorsAndPower', () => {
  it('parses standard "2 CCS2: 120 kW"', () => {
    expect(parseConnectorsAndPower('2 CCS2: 120 kW')).toEqual({
      connectors: ['CCS2'],
      portCount: 2,
      maxPowerKw: 120,
    });
  });

  it('parses no-space "2CCS: 60 kW"', () => {
    expect(parseConnectorsAndPower('2CCS: 60 kW')).toEqual({
      connectors: ['CCS2'],
      portCount: 2,
      maxPowerKw: 60,
    });
  });

  it('parses kW without space "2 CCS2: 60kW"', () => {
    expect(parseConnectorsAndPower('2 CCS2: 60kW')).toEqual({
      connectors: ['CCS2'],
      portCount: 2,
      maxPowerKw: 60,
    });
  });

  it('parses Type 2 AC connector', () => {
    const r = parseConnectorsAndPower('4 Type 2: 22 kW');
    expect(r.connectors).toEqual(['Type2_AC']);
    expect(r.portCount).toBe(4);
    expect(r.maxPowerKw).toBe(22);
  });

  it('parses CHAdeMO', () => {
    expect(parseConnectorsAndPower('1 CHAdeMO: 50 kW').connectors).toEqual(['CHAdeMO']);
  });

  it('handles trailing whitespace and CRLF', () => {
    expect(parseConnectorsAndPower('2 CCS2: 120 kW\r\n')).toEqual({
      connectors: ['CCS2'],
      portCount: 2,
      maxPowerKw: 120,
    });
  });

  it('falls back to safe defaults when content is unparseable', () => {
    expect(parseConnectorsAndPower('')).toEqual({
      connectors: ['Unknown'],
      portCount: 1,
      maxPowerKw: 0,
    });
    expect(parseConnectorsAndPower('   ')).toEqual({
      connectors: ['Unknown'],
      portCount: 1,
      maxPowerKw: 0,
    });
  });
});

describe('parseProvinceFromAddress', () => {
  it('extracts the trailing "Tỉnh ..." segment', () => {
    expect(
      parseProvinceFromAddress('Số 163A Ấp Quảng Hoà , Xã Quảng Tiến , Huyện Trảng Bom , Tỉnh Đồng Nai'),
    ).toBe('Đồng Nai');
  });

  it('extracts "TP. Hồ Chí Minh"', () => {
    expect(
      parseProvinceFromAddress('39 QL1A , Phường Hiệp Bình Phước , Quận Thủ Đức , TP. Hồ Chí Minh'),
    ).toBe('TP. Hồ Chí Minh');
  });

  it('falls back to a region label when nothing matches', () => {
    expect(parseProvinceFromAddress('')).toBe('Unknown');
  });
});

describe('parseEVPowerStation', () => {
  it('maps a real DC station from the captured fixture', () => {
    const station = parseEVPowerStation(sampleStations[0]);
    expect(station.name).toBe('SHD');
    expect(station.latitude).toBeCloseTo(10.9361, 4);
    expect(station.longitude).toBeCloseTo(106.981, 3);
    expect(station.provider).toBe('EVPower');
    expect(station.dataSource).toBe('evpower');
    expect(station.isVinFastOnly).toBe(false);
    expect(station.connectorTypes).toBe('CCS2');
    expect(station.portCount).toBe(2);
    expect(station.maxPowerKw).toBe(120);
    expect(station.stationType).toBe('DC');
    expect(station.chargingStatus).toBe('ACTIVE');
    expect(station.evpowerId).toBeTruthy();
  });

  it('maps an AC station correctly', () => {
    const ac = sampleStations.find((s) => s._type === 'AC');
    if (!ac) throw new Error('fixture should contain at least one AC station');
    const station = parseEVPowerStation(ac);
    expect(station.stationType).toBe('AC');
  });

  it('produces a stable evpowerId across runs', () => {
    const a = parseEVPowerStation(sampleStations[0]);
    const b = parseEVPowerStation({ ...sampleStations[0] });
    expect(a.evpowerId).toBe(b.evpowerId);
  });

  it('produces different evpowerIds for different stations', () => {
    const a = parseEVPowerStation(sampleStations[0]);
    const b = parseEVPowerStation(sampleStations[1]);
    expect(a.evpowerId).not.toBe(b.evpowerId);
  });
});

describe('evpowerStationKey', () => {
  it('is deterministic and short', () => {
    const k = evpowerStationKey('SHD', 10.9361, 106.981);
    expect(k).toMatch(/^evp_/);
    expect(k.length).toBeLessThanOrEqual(40);
  });
});
