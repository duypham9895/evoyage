/**
 * Canonical TypeScript mirror of the role tokens declared in src/app/globals.css's
 * `@theme` block (D8-A — design-system-research-2026-11-01.md §D8, Phase 2).
 *
 * Exists for surfaces that cannot read CSS custom properties: Mapbox GL JS WebGL
 * paint properties and transactional email HTML. Every value here must equal its
 * `--color-*` counterpart in globals.css — tokens.test.ts enforces this by parsing
 * globals.css and diffing against this object. Update both files together.
 */

export type StationStatusKey = 'available' | 'busy' | 'unavailable' | 'unknown';

export interface StatusTokens {
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
}

export const designTokens: {
  readonly status: Record<StationStatusKey, StatusTokens>;
  readonly onAccent: string;
  readonly scrim: string;
} = {
  status: {
    available: { fg: '#34C759', bg: 'rgba(52, 199, 89, 0.13)', border: '#34C759' },
    busy: { fg: '#FFAB40', bg: 'rgba(255, 171, 64, 0.13)', border: '#FFAB40' },
    unavailable: { fg: '#666666', bg: 'rgba(102, 102, 102, 0.13)', border: '#666666' },
    unknown: { fg: '#6B6B78', bg: 'rgba(107, 107, 120, 0.13)', border: '#6B6B78' },
  },
  onAccent: '#0F0F11',
  scrim: 'rgba(0, 0, 0, 0.6)',
};
