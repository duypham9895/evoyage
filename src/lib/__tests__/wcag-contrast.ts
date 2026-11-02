// Test-only helper: resolves `text-[var(--color-x)]` classes against the
// design tokens in globals.css and computes the WCAG 2.x contrast ratio.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');

export function tokenHex(token: string): string {
  const match = css.match(new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${token} not found as a hex value in globals.css`);
  return match[1];
}

/** Returns the token named by the first `text-[var(--color-x)]` class (ignoring hover:/placeholder: variants). */
export function textColorToken(className: string): string {
  const match = className.match(/(?:^|\s)text-\[var\(--color-([a-z-]+)\)\]/);
  // Keep this message free of anything Tailwind can read as a class: its scanner reads every file,
  // and a "text-" + "[var(--color-" + "*)]" token compiles to invalid CSS that breaks the dev server.
  if (!match) throw new Error(`no text colour token class found in "${className}"`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const [hi, lo] = [luminance(fgHex), luminance(bgHex)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 1.4.3 AA minimum for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;
