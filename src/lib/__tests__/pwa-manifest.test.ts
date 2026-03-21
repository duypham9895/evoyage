import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('PWA manifest', () => {
  const manifestPath = resolve(__dirname, '../../../public/manifest.json');
  let manifest: Record<string, unknown>;

  it('is valid JSON', () => {
    const raw = readFileSync(manifestPath, 'utf8');
    expect(() => { manifest = JSON.parse(raw); }).not.toThrow();
  });

  it('has required fields', () => {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBeDefined();
  });

  it('has standalone display mode', () => {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.display).toBe('standalone');
  });

  it('has icons array', () => {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as unknown[]).length).toBeGreaterThan(0);
  });

  it('has correct theme colors', () => {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.background_color).toBe('#0F0F11');
    expect(manifest.theme_color).toBe('#00D4AA');
  });

  it('starts at /plan', () => {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.start_url).toBe('/plan');
  });
});
