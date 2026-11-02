import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Finding D of docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md:
// the production deploy only checked that `vercel deploy` printed a URL, never
// that the live site answered. The smoke step reports only: it never rolls back.
const deployYml = readFileSync(
  resolve(__dirname, '../../../.github/workflows/deploy.yml'),
  'utf8',
);

function stepIndex(name: string): number {
  const i = deployYml.indexOf(`- name: ${name}\n`);
  expect(i, `step "${name}" exists`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('deploy.yml post-deploy smoke check', () => {
  it('runs between Deploy and Mark deployment success, so a failure marks the deployment failed', () => {
    const smoke = stepIndex('Smoke-test production');

    expect(smoke).toBeGreaterThan(stepIndex('Deploy'));
    expect(smoke).toBeLessThan(stepIndex('Mark deployment success'));
  });

  it('only runs for the production deploy on main', () => {
    const step = deployYml.slice(stepIndex('Smoke-test production'), stepIndex('Mark deployment success'));

    expect(step).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
  });

  it('checks /api/health and /api/vehicles on the production domain', () => {
    const step = deployYml.slice(stepIndex('Smoke-test production'), stepIndex('Mark deployment success'));

    expect(step).toContain('https://evoyage.duypham.me/api/health');
    expect(step).toContain('https://evoyage.duypham.me/api/vehicles');
    expect(step).toContain('set -eo pipefail');
    expect(step).not.toMatch(/vercel (rollback|promote)/);
  });
});
