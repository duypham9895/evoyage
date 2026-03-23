import { describe, it, expect } from 'vitest';
import {
  getMarkerSize,
  getStatusRingStyle,
  renderSmartMarkerHtml,
  type SmartMarkerData,
} from './smart-marker';

describe('smart-marker', () => {
  describe('getMarkerSize', () => {
    it('returns slow for < 30 kW', () => {
      expect(getMarkerSize(22)).toEqual({ size: 20, className: 'power-slow', showLabel: false });
    });

    it('returns slow for 0 kW', () => {
      expect(getMarkerSize(0)).toEqual({ size: 20, className: 'power-slow', showLabel: false });
    });

    it('returns medium for 30-99 kW', () => {
      expect(getMarkerSize(30)).toEqual({ size: 28, className: 'power-medium', showLabel: false });
      expect(getMarkerSize(60)).toEqual({ size: 28, className: 'power-medium', showLabel: false });
      expect(getMarkerSize(99)).toEqual({ size: 28, className: 'power-medium', showLabel: false });
    });

    it('returns fast for >= 100 kW with label shown', () => {
      expect(getMarkerSize(100)).toEqual({ size: 36, className: 'power-fast', showLabel: true });
      expect(getMarkerSize(150)).toEqual({ size: 36, className: 'power-fast', showLabel: true });
      expect(getMarkerSize(350)).toEqual({ size: 36, className: 'power-fast', showLabel: true });
    });
  });

  describe('getStatusRingStyle', () => {
    it('returns green for available status (lowercase)', () => {
      const result = getStatusRingStyle('active');
      expect(result.color).toBe('#34C759');
      expect(result.style).toContain('3px');
    });

    it('returns green for available status (UPPERCASE)', () => {
      const result = getStatusRingStyle('ACTIVE');
      expect(result.color).toBe('#34C759');
    });

    it('returns amber for busy status', () => {
      expect(getStatusRingStyle('busy').color).toBe('#FFAB40');
      expect(getStatusRingStyle('BUSY').color).toBe('#FFAB40');
    });

    it('returns gray for unavailable/inactive status', () => {
      expect(getStatusRingStyle('unavailable').color).toBe('#666666');
      expect(getStatusRingStyle('UNAVAILABLE').color).toBe('#666666');
      expect(getStatusRingStyle('inactive').color).toBe('#666666');
      expect(getStatusRingStyle('INACTIVE').color).toBe('#666666');
    });

    it('returns dashed style for null status (no data)', () => {
      const result = getStatusRingStyle(null);
      expect(result.style).toContain('dashed');
    });

    it('returns dashed style for empty string status', () => {
      const result = getStatusRingStyle('');
      expect(result.style).toContain('dashed');
    });

    it('returns dashed style for unknown status values', () => {
      const result = getStatusRingStyle('some-random-value');
      expect(result.style).toContain('dashed');
    });
  });

  describe('renderSmartMarkerHtml', () => {
    const baseStation: SmartMarkerData = {
      provider: 'VinFast',
      maxPowerKw: 150,
      chargingStatus: 'active',
      isCompatible: true,
    };

    it('renders a div with correct size for fast charger', () => {
      const html = renderSmartMarkerHtml(baseStation);
      expect(html).toContain('width:36px');
      expect(html).toContain('height:36px');
    });

    it('shows power label for fast chargers (>= 100 kW)', () => {
      const html = renderSmartMarkerHtml(baseStation);
      expect(html).toContain('150');
    });

    it('does NOT show power label for slow chargers', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, maxPowerKw: 22 });
      expect(html).not.toContain('>22<');
    });

    it('applies provider color as background', () => {
      const html = renderSmartMarkerHtml(baseStation);
      expect(html).toContain('#34C759'); // VinFast green
    });

    it('uses default color for unknown provider', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, provider: 'UnknownCo' });
      expect(html).toContain('#6B6B78');
    });

    it('renders green status ring for active status', () => {
      const html = renderSmartMarkerHtml(baseStation);
      // Status ring encoded as box-shadow
      expect(html).toContain('box-shadow');
      expect(html).toContain('#34C759');
    });

    it('renders amber status ring for busy status', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, chargingStatus: 'busy' });
      expect(html).toContain('#FFAB40');
    });

    it('renders dashed border for null status', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, chargingStatus: null });
      expect(html).toContain('dashed');
    });

    it('renders green compatibility dot when isCompatible is true', () => {
      const html = renderSmartMarkerHtml(baseStation);
      expect(html).toContain('compat-dot');
      expect(html).toContain('#34C759');
    });

    it('renders red compatibility dot when isCompatible is false', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, isCompatible: false });
      expect(html).toContain('compat-dot');
      expect(html).toContain('#FF3B30');
    });

    it('hides compatibility dot when isCompatible is null', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, isCompatible: null });
      expect(html).not.toContain('compat-dot');
    });

    it('hides compatibility dot when isCompatible is undefined', () => {
      const html = renderSmartMarkerHtml({ ...baseStation, isCompatible: undefined });
      expect(html).not.toContain('compat-dot');
    });

    it('has border-radius 50% (circular)', () => {
      const html = renderSmartMarkerHtml(baseStation);
      expect(html).toContain('border-radius:50%');
    });

    it('escapes HTML in provider name to prevent XSS', () => {
      // Provider name goes into style (color lookup), not into HTML content,
      // so XSS through provider is prevented by the lookup defaulting to safe color.
      // But let's verify no raw injection:
      const html = renderSmartMarkerHtml({
        ...baseStation,
        provider: '<script>alert(1)</script>',
      });
      expect(html).not.toContain('<script>');
    });
  });
});
