import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// D10-A (docs/design/design-system-research-2026-11-01.md): Be Vietnam Pro
// weight 300 had a single user, so it was a font file downloaded for one line.
describe('root layout font loading', () => {
  const layoutSource = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8');
  const landingSource = readFileSync(
    resolve(__dirname, '../components/landing/LandingPageContent.tsx'),
    'utf8',
  );

  it('does not request Be Vietnam Pro weight 300', () => {
    const weightLine = layoutSource.match(/weight:\s*\[([^\]]*)\]/);
    expect(weightLine).not.toBeNull();
    expect(weightLine?.[1]).not.toContain("'300'");
  });

  it('leaves no font-light usage that would need weight 300', () => {
    expect(landingSource).not.toContain('font-light');
  });
});
