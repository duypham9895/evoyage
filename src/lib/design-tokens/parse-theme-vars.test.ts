import { describe, it, expect } from 'vitest';
import { parseThemeColorVars } from './parse-theme-vars';

describe('parseThemeColorVars', () => {
  it('parses a single --color-* declaration from a @theme inline block', () => {
    const css = `
      @theme inline {
        --color-accent: #00D4AA;
      }
    `;
    expect(parseThemeColorVars(css)).toEqual({ accent: '#00D4AA' });
  });

  it('parses multiple declarations and trims surrounding whitespace', () => {
    const css = `
      @theme inline {
        --color-status-available-fg:   #34C759  ;
        --color-status-available-bg: rgba(52, 199, 89, 0.13);
      }
    `;
    expect(parseThemeColorVars(css)).toEqual({
      'status-available-fg': '#34C759',
      'status-available-bg': 'rgba(52, 199, 89, 0.13)',
    });
  });

  it('ignores non-color custom properties in the same block', () => {
    const css = `
      @theme inline {
        --color-accent: #00D4AA;
        --font-sans: var(--font-sans), system-ui, sans-serif;
      }
    `;
    expect(parseThemeColorVars(css)).toEqual({ accent: '#00D4AA' });
  });

  it('merges declarations across multiple @theme blocks', () => {
    const css = `
      @theme inline {
        --color-accent: #00D4AA;
      }
      body { color: red; }
      @theme {
        --color-scrim: rgba(0, 0, 0, 0.6);
      }
    `;
    expect(parseThemeColorVars(css)).toEqual({
      accent: '#00D4AA',
      scrim: 'rgba(0, 0, 0, 0.6)',
    });
  });

  it('returns an empty object when there is no @theme block', () => {
    const css = `body { color: red; }`;
    expect(parseThemeColorVars(css)).toEqual({});
  });

  it('does not match declarations outside of a @theme block', () => {
    const css = `
      :root { --color-outside: #000000; }
      @theme inline {
        --color-inside: #FFFFFF;
      }
    `;
    expect(parseThemeColorVars(css)).toEqual({ inside: '#FFFFFF' });
  });
});
