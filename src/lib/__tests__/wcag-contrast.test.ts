import { describe, it, expect } from 'vitest';
import { contrastRatio, tokenHex, textColorToken } from './wcag-contrast';

describe('wcag-contrast test helper', () => {
  it('computes the WCAG ratio for black on white as 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('reads design tokens from globals.css', () => {
    expect(tokenHex('background')).toBe('#0F0F11');
  });

  it('extracts the base text colour token and ignores hover variants', () => {
    expect(textColorToken('px-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)]')).toBe('muted');
  });
});
