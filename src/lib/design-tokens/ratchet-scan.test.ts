import { describe, it, expect } from 'vitest';
import {
  stripComments,
  countHardcodedColors,
  countTinyTextSizes,
  countRawPaletteClasses,
  countUndefinedColorVars,
  parseDeclaredColorVars,
  scanSource,
  hasAnyViolation,
} from './ratchet-scan';

describe('stripComments', () => {
  it('removes a line comment but keeps the code before and after it', () => {
    expect(stripComments('const a = 1; // #100\nconst b = 2;')).toBe('const a = 1; \nconst b = 2;');
  });

  it('removes a block comment that spans multiple lines', () => {
    expect(stripComments('const a = 1;\n/* #ff0000\n   also #abc */\nconst b = 2;')).toBe(
      'const a = 1;\n\nconst b = 2;',
    );
  });

  it('does not treat "://" inside a string as the start of a comment', () => {
    const src = 'const url = "https://example.com/#faq";';
    expect(stripComments(src)).toBe(src);
  });

  it('keeps hex colours that live inside string or template literals', () => {
    const src = "const c = '#ff0000'; const d = `#00D4AA`;";
    expect(stripComments(src)).toBe(src);
  });
});

describe('countHardcodedColors', () => {
  it('counts a 6-digit hex colour inside a Tailwind arbitrary class', () => {
    expect(countHardcodedColors('<div className="bg-[#3b82f6]" />')).toBe(1);
  });

  it('counts a 3-digit hex colour', () => {
    expect(countHardcodedColors("border: '#fff'")).toBe(1);
  });

  it('counts an 8-digit hex colour with an alpha channel', () => {
    expect(countHardcodedColors("'#3b82f6cc'")).toBe(1);
  });

  it('counts rgb(), rgba() and hsl() literals', () => {
    expect(countHardcodedColors('rgba(0,212,170,0.25) rgb(1,2,3) hsl(200, 50%, 50%)')).toBe(3);
  });

  it('does not count a run of hex-like characters longer than 8 digits', () => {
    expect(countHardcodedColors('#123456789')).toBe(0);
  });

  it('does not count a GitHub issue reference such as "#100" (real false-positive risk: see mapbox-token.ts)', () => {
    expect(countHardcodedColors('// fixed in issue #100')).toBe(0);
  });

  it('does not count a colour that only appears inside a comment', () => {
    expect(countHardcodedColors('/* brand colour #34C759 */ const x = 1;')).toBe(0);
  });

  it('does not flag a var(--color-x) token reference as a hard-coded colour', () => {
    expect(countHardcodedColors('className="text-[var(--color-accent)]"')).toBe(0);
  });

  it('does not flag hsla/rgba when they are not followed by a numeric argument', () => {
    expect(countHardcodedColors('rgba(var(--color-accent), 0.5)')).toBe(0);
  });
});

describe('countTinyTextSizes', () => {
  it.each([9, 10, 11])('counts text-[%dpx]', (n) => {
    expect(countTinyTextSizes(`text-[${n}px]`)).toBe(1);
  });

  it('does not count the 12px DESIGN.md floor', () => {
    expect(countTinyTextSizes('text-[12px]')).toBe(0);
  });

  it('does not count token-based sizes', () => {
    expect(countTinyTextSizes('text-sm text-base text-xs')).toBe(0);
  });

  it('counts a tiny size inside a responsive or state variant', () => {
    expect(countTinyTextSizes('sm:hover:text-[10px]')).toBe(1);
  });

  it('does not count a tiny size mentioned only in a comment', () => {
    expect(countTinyTextSizes('// was text-[10px], now text-xs')).toBe(0);
  });
});

describe('countRawPaletteClasses', () => {
  it('counts a raw Tailwind palette class with a status-colour name', () => {
    expect(countRawPaletteClasses('text-green-500')).toBe(1);
  });

  it('counts a raw palette class with an opacity modifier', () => {
    expect(countRawPaletteClasses('bg-yellow-500/10 text-yellow-600')).toBe(2);
  });

  it('counts a raw palette class inside a responsive or state variant', () => {
    expect(countRawPaletteClasses('sm:hover:text-blue-400')).toBe(1);
  });

  it('counts each palette-colour prefix (bg/text/border/ring/etc) once', () => {
    expect(countRawPaletteClasses('bg-red-500 text-red-500 border-red-500 ring-red-500')).toBe(4);
  });

  it('does not count a token-based class such as text-[var(--color-accent)]', () => {
    expect(countRawPaletteClasses('text-[var(--color-accent)]')).toBe(0);
  });

  it('does not count non-palette colour keywords (white/black/transparent/current)', () => {
    expect(countRawPaletteClasses('bg-white text-black border-transparent ring-current')).toBe(0);
  });

  it('does not count a size or spacing utility that is not a colour', () => {
    expect(countRawPaletteClasses('text-sm text-xs p-4 w-full')).toBe(0);
  });

  it('does not count a palette class mentioned only in a comment', () => {
    expect(countRawPaletteClasses('// was bg-blue-500, now a token')).toBe(0);
  });
});

describe('parseDeclaredColorVars', () => {
  it('reads --color-* declarations out of an @theme inline block', () => {
    const css = '@theme inline {\n  --color-accent: #00D4AA;\n  --color-muted: #6B6B78;\n  --font-sans: sans-serif;\n}';
    expect(parseDeclaredColorVars(css)).toEqual(new Set(['accent', 'muted']));
  });

  it('also reads --color-* declarations out of a :root block', () => {
    const css = ':root {\n  --color-focus: #ffffff;\n}';
    expect(parseDeclaredColorVars(css)).toEqual(new Set(['focus']));
  });

  it('does not pick up a --color-* declaration outside any @theme or :root block', () => {
    const css = '.foo { --color-rogue: #000; }';
    expect(parseDeclaredColorVars(css)).toEqual(new Set());
  });

  it('merges declarations from multiple blocks in the same file', () => {
    const css = '@theme inline {\n --color-a: #111;\n}\n:root {\n --color-b: #222;\n}';
    expect(parseDeclaredColorVars(css)).toEqual(new Set(['a', 'b']));
  });
});

describe('countUndefinedColorVars', () => {
  const declared = new Set(['accent', 'muted']);

  it('does not flag a declared token', () => {
    expect(countUndefinedColorVars('text-[var(--color-accent)]', declared)).toBe(0);
  });

  it('flags a var(--color-NAME) reference whose NAME is not declared', () => {
    expect(countUndefinedColorVars('bg-[var(--color-bg)]', declared)).toBe(1);
  });

  it('counts each undeclared reference once, even if the same name repeats', () => {
    expect(countUndefinedColorVars('text-[var(--color-text)] hover:text-[var(--color-text)]', declared)).toBe(2);
  });

  it('does not flag an undeclared var that only appears in a comment', () => {
    expect(countUndefinedColorVars('// var(--color-ghost)', declared)).toBe(0);
  });
});

describe('scanSource', () => {
  it('combines the hex, tinyText, rawPalette and undefinedVars counts for a file', () => {
    const declared = new Set(['accent']);
    const src = `
      const a = '#3b82f6'; // hex
      className="text-[10px] text-[var(--color-ghost)] text-amber-500"
    `;
    expect(scanSource(src, declared)).toEqual({ hex: 1, tinyText: 1, rawPalette: 1, undefinedVars: 1 });
  });

  it('returns all zeros for a file with no violations', () => {
    const declared = new Set(['accent']);
    expect(scanSource('className="text-[var(--color-accent)] text-sm"', declared)).toEqual({
      hex: 0,
      tinyText: 0,
      rawPalette: 0,
      undefinedVars: 0,
    });
  });
});

describe('hasAnyViolation', () => {
  const none = { hex: 0, tinyText: 0, rawPalette: 0, undefinedVars: 0 };

  it('is false when every category is zero', () => {
    expect(hasAnyViolation(none)).toBe(false);
  });

  it.each(['hex', 'tinyText', 'rawPalette', 'undefinedVars'] as const)(
    'is true when only %s is non-zero (a file with a single violation category must still be tracked)',
    (category) => {
      expect(hasAnyViolation({ ...none, [category]: 1 })).toBe(true);
    },
  );
});
