import { describe, it, expect } from 'vitest';
import { renderMiniCardHtml, type MiniCardData } from './mini-card';

describe('mini-card', () => {
  const baseData: MiniCardData = {
    name: 'VinFast Charging Quận 1',
    distanceKm: 0.8,
    maxPowerKw: 150,
    connectorTypes: ['CCS2'],
    portCount: 4,
    provider: 'VinFast',
    chargingStatus: 'active',
    isCompatible: true,
    estimatedChargeTimeMin: 18,
    latitude: 10.762,
    longitude: 106.66,
  };

  describe('basic rendering', () => {
    it('renders station name', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('VinFast Charging Quận 1');
    });

    it('renders distance', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('0.8 km');
    });

    it('renders power and connector type', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('150 kW');
      expect(html).toContain('CCS2');
    });

    it('renders port count', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('4 ports');
    });

    it('renders provider name', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('VinFast');
    });
  });

  describe('status badge', () => {
    it('renders Available badge for active status', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('Available');
      expect(html).toContain('#34C759');
    });

    it('renders Busy badge for busy status', () => {
      const html = renderMiniCardHtml({ ...baseData, chargingStatus: 'busy' });
      expect(html).toContain('Busy');
      expect(html).toContain('#FFAB40');
    });

    it('renders Offline badge for unavailable status', () => {
      const html = renderMiniCardHtml({ ...baseData, chargingStatus: 'unavailable' });
      expect(html).toContain('Offline');
    });

    it('renders unknown badge for null status', () => {
      const html = renderMiniCardHtml({ ...baseData, chargingStatus: null });
      expect(html).toContain('Status unknown');
    });
  });

  describe('uncertainty disclaimer', () => {
    it('shows disclaimer text when status exists', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('Status may not be current');
    });

    it('does not show disclaimer when status is null', () => {
      const html = renderMiniCardHtml({ ...baseData, chargingStatus: null });
      expect(html).not.toContain('Status may not be current');
    });
  });

  describe('compatibility', () => {
    it('shows Compatible when isCompatible is true', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('Compatible');
    });

    it('shows Not compatible when isCompatible is false', () => {
      const html = renderMiniCardHtml({ ...baseData, isCompatible: false });
      expect(html).toContain('Not compatible');
    });

    it('hides compatibility line when isCompatible is null', () => {
      const html = renderMiniCardHtml({ ...baseData, isCompatible: null });
      expect(html).not.toContain('Compatible');
      expect(html).not.toContain('Not compatible');
    });
  });

  describe('charge time', () => {
    it('shows estimated charge time when available', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('~18 min to 80%');
    });

    it('hides charge time when null', () => {
      const html = renderMiniCardHtml({ ...baseData, estimatedChargeTimeMin: null });
      expect(html).not.toContain('min to 80%');
    });
  });

  describe('action buttons', () => {
    it('renders Ask eVi button', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('Ask eVi');
    });

    it('renders Navigate button with Google Maps link', () => {
      const html = renderMiniCardHtml(baseData);
      expect(html).toContain('Navigate');
      expect(html).toContain('google.com/maps/dir');
      expect(html).toContain('10.762');
      expect(html).toContain('106.66');
    });
  });

  describe('XSS prevention', () => {
    it('escapes station name', () => {
      const html = renderMiniCardHtml({
        ...baseData,
        name: '<script>alert("xss")</script>',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes connector types', () => {
      const html = renderMiniCardHtml({
        ...baseData,
        connectorTypes: ['<img onerror=alert(1)>'],
      });
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('escapes provider name', () => {
      const html = renderMiniCardHtml({
        ...baseData,
        provider: '"><script>alert(1)</script>',
      });
      expect(html).not.toContain('<script>');
    });
  });

  describe('edge cases', () => {
    it('renders with 0 ports', () => {
      const html = renderMiniCardHtml({ ...baseData, portCount: 0 });
      expect(html).toContain('0 ports');
    });

    it('renders with empty connector types', () => {
      const html = renderMiniCardHtml({ ...baseData, connectorTypes: [] });
      expect(html).toContain('150 kW');
    });

    it('renders with very long station name without breaking', () => {
      const longName = 'VinFast Charging Station Quận 1 - Nguyễn Huệ Walking Street Corner';
      const html = renderMiniCardHtml({ ...baseData, name: longName });
      expect(html).toContain(longName);
    });

    it('formats distance rounded to one decimal', () => {
      const html = renderMiniCardHtml({ ...baseData, distanceKm: 1.234 });
      expect(html).toContain('1.2 km');
    });
  });
});
