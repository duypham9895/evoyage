import { describe, expect, it } from 'vitest';
import { clusterMissingStationFeedback, type FeedbackPoint } from './cluster-feedback';

const point = (
  id: string,
  lat: number,
  lng: number,
  ipHash: string,
  overrides: Partial<FeedbackPoint> = {},
): FeedbackPoint => ({
  id,
  latitude: lat,
  longitude: lng,
  ipHash,
  stationName: overrides.stationName ?? `Station ${id}`,
  description: overrides.description ?? 'Some description',
  proposedProvider: overrides.proposedProvider ?? null,
});

describe('clusterMissingStationFeedback', () => {
  it('returns no clusters for empty input', () => {
    expect(clusterMissingStationFeedback([])).toEqual([]);
  });

  it('returns no clusters for fewer than 3 reports', () => {
    const points = [
      point('a', 10.7626, 106.6602, 'ip1'),
      point('b', 10.7626, 106.6603, 'ip2'),
    ];
    expect(clusterMissingStationFeedback(points)).toEqual([]);
  });

  it('forms one cluster when 3 reports sit within 50m of each other', () => {
    // ~5m apart along longitude at HCMC latitude
    const points = [
      point('a', 10.7626, 106.6602, 'ip1', { stationName: 'Vincom Center' }),
      point('b', 10.7626, 106.66024, 'ip2', { stationName: 'Vincom Center' }),
      point('c', 10.7626, 106.66028, 'ip3', { stationName: 'Vincom Center' }),
    ];
    const clusters = clusterMissingStationFeedback(points);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
    expect(clusters[0].centroid.latitude).toBeCloseTo(10.7626, 4);
  });

  it('does not cluster when reports are far apart', () => {
    // HCMC, Hanoi, Da Nang — clearly distinct
    const points = [
      point('a', 10.7626, 106.6602, 'ip1'),
      point('b', 21.0285, 105.8542, 'ip2'),
      point('c', 16.0544, 108.2022, 'ip3'),
    ];
    expect(clusterMissingStationFeedback(points)).toEqual([]);
  });

  it('rejects clusters where fewer than 3 unique ipHashes exist (single-user spam guard)', () => {
    // Same IP submitting 3 times from the same coords
    const points = [
      point('a', 10.7626, 106.6602, 'ipSame'),
      point('b', 10.7626, 106.66024, 'ipSame'),
      point('c', 10.7626, 106.66028, 'ipSame'),
    ];
    expect(clusterMissingStationFeedback(points)).toEqual([]);
  });

  it('rejects 2 unique IPs even when 3 reports exist (still spammable)', () => {
    const points = [
      point('a', 10.7626, 106.6602, 'ip1'),
      point('b', 10.7626, 106.66024, 'ip1'),
      point('c', 10.7626, 106.66028, 'ip2'),
    ];
    expect(clusterMissingStationFeedback(points)).toEqual([]);
  });

  it('does not single-link distant points through a chain (uses pairwise 50m check)', () => {
    // A-B 40m, B-C 40m, but A-C 80m — should NOT collapse into one cluster
    const points = [
      point('a', 10.7626, 106.66020, 'ip1'),
      point('b', 10.7626, 106.66056, 'ip2'),
      point('c', 10.7626, 106.66092, 'ip3'),
    ];
    expect(clusterMissingStationFeedback(points)).toEqual([]);
  });

  it('picks the most common stationName for the cluster', () => {
    const points = [
      point('a', 10.7626, 106.6602, 'ip1', { stationName: 'Wrong Name' }),
      point('b', 10.7626, 106.66024, 'ip2', { stationName: 'Real Vincom' }),
      point('c', 10.7626, 106.66028, 'ip3', { stationName: 'Real Vincom' }),
    ];
    const [cluster] = clusterMissingStationFeedback(points);
    expect(cluster.name).toBe('Real Vincom');
  });

  it('falls back to "Community-reported station" when no name is provided', () => {
    const points = [
      point('a', 10.7626, 106.6602, 'ip1', { stationName: '' }),
      point('b', 10.7626, 106.66024, 'ip2', { stationName: '' }),
      point('c', 10.7626, 106.66028, 'ip3', { stationName: '' }),
    ];
    const [cluster] = clusterMissingStationFeedback(points);
    expect(cluster.name).toMatch(/community|crowdsourced/i);
  });

  it('picks the longest description as the address proxy', () => {
    const points = [
      point('a', 10.7626, 106.6602, 'ip1', { description: 'short' }),
      point('b', 10.7626, 106.66024, 'ip2', { description: 'this is a much longer address description' }),
      point('c', 10.7626, 106.66028, 'ip3', { description: 'mid length' }),
    ];
    const [cluster] = clusterMissingStationFeedback(points);
    expect(cluster.address).toBe('this is a much longer address description');
  });

  it('uses the most common proposedProvider', () => {
    const points = [
      point('a', 10.7626, 106.6602, 'ip1', { proposedProvider: 'EBOOST' }),
      point('b', 10.7626, 106.66024, 'ip2', { proposedProvider: 'EBOOST' }),
      point('c', 10.7626, 106.66028, 'ip3', { proposedProvider: null }),
    ];
    const [cluster] = clusterMissingStationFeedback(points);
    expect(cluster.provider).toBe('EBOOST');
  });

  it('finds two independent clusters in the same input', () => {
    const points = [
      // HCMC cluster
      point('a', 10.7626, 106.6602, 'ip1'),
      point('b', 10.7626, 106.66024, 'ip2'),
      point('c', 10.7626, 106.66028, 'ip3'),
      // Hanoi cluster
      point('d', 21.0285, 105.8542, 'ip4'),
      point('e', 21.0285, 105.85424, 'ip5'),
      point('f', 21.0285, 105.85428, 'ip6'),
    ];
    const clusters = clusterMissingStationFeedback(points);
    expect(clusters).toHaveLength(2);
  });
});
