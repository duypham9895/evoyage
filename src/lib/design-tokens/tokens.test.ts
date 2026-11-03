import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { designTokens } from './tokens';
import { parseThemeColorVars } from './parse-theme-vars';

// Parity guard for the D8-A role tokens (design-system-research-2026-11-01.md
// §D8, Phase 2). `designTokens` is the only way a surface that cannot read CSS
// custom properties — Mapbox GL WebGL paint, transactional email HTML — can get
// at these colours. If the two sources drift, map pins and the station list
// would render different colours for the same status. Normalizes whitespace so
// harmless formatting differences (e.g. spacing inside `rgba()`) don't fail.

const GLOBALS_CSS_PATH = path.resolve(__dirname, '../../app/globals.css');

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

describe('design tokens — CSS/TS parity (D8-A)', () => {
  const cssVars = parseThemeColorVars(readFileSync(GLOBALS_CSS_PATH, 'utf8'));

  const expectedPairs: ReadonlyArray<readonly [cssVarName: string, tsValue: string]> = [
    ['status-available-fg', designTokens.status.available.fg],
    ['status-available-bg', designTokens.status.available.bg],
    ['status-available-border', designTokens.status.available.border],
    ['status-busy-fg', designTokens.status.busy.fg],
    ['status-busy-bg', designTokens.status.busy.bg],
    ['status-busy-border', designTokens.status.busy.border],
    ['status-unavailable-fg', designTokens.status.unavailable.fg],
    ['status-unavailable-bg', designTokens.status.unavailable.bg],
    ['status-unavailable-border', designTokens.status.unavailable.border],
    ['status-unknown-fg', designTokens.status.unknown.fg],
    ['status-unknown-bg', designTokens.status.unknown.bg],
    ['status-unknown-border', designTokens.status.unknown.border],
    ['on-accent', designTokens.onAccent],
    ['scrim', designTokens.scrim],
  ];

  it.each(expectedPairs)('--color-%s in globals.css matches designTokens', (cssVarName, tsValue) => {
    expect(cssVars[cssVarName], `--color-${cssVarName} is not declared in globals.css's @theme block`).toBeDefined();
    expect(normalize(cssVars[cssVarName])).toBe(normalize(tsValue));
  });
});
