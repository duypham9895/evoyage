import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Lint and type check ran with `continue-on-error` while a backlog existed.
// Both reached zero (eslint: 0 errors, tsc: 0 errors), so they now gate merges.
// Warnings stay non-blocking: eslint exits 0 on warnings unless --max-warnings is set.
const root = resolve(__dirname, '../../..');
const deployYml = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8');

function step(name: string): string {
  const start = deployYml.indexOf(`- name: ${name}\n`);
  expect(start, `step "${name}" exists`).toBeGreaterThanOrEqual(0);
  const next = deployYml.indexOf('- name: ', start + 1);
  return deployYml.slice(start, next === -1 ? undefined : next);
}

describe('deploy.yml lint and type-check gates', () => {
  it('fails the run on eslint errors but not on warnings', () => {
    const lint = step('Lint');

    expect(lint).toContain('npx eslint src scripts');
    expect(lint).not.toContain('continue-on-error');
    expect(lint).not.toContain('--max-warnings');
  });

  it('fails the run on TypeScript errors', () => {
    const tsc = step('Type check');

    expect(tsc).toContain('npx tsc --noEmit');
    expect(tsc).not.toContain('continue-on-error');
  });
});

describe('.gitignore', () => {
  it('ignores the vitest JSON report directory so it is never committed', () => {
    const lines = readFileSync(resolve(root, '.gitignore'), 'utf8').split('\n');

    expect(lines).toContain('/.vitest/');
  });
});
