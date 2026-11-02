import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// The legacy /vn_vi/get-locators endpoint always answers 200 with
// {"data":[]} now (see scripts/poll-vinfast-station-status.ts), so any
// GitHub Actions script that fetches it can never go red — it's a dead
// canary. This test scans every scheduled workflow script and fails if
// one still calls that endpoint directly.
describe('workflow scripts do not fetch the legacy get-locators endpoint', () => {
  const workflowsDir = resolve(__dirname, '../../../.github/workflows');
  const scriptsDir = resolve(__dirname, '../../../scripts');
  const legacyLocatorsFetch = /fetch\(\s*['"][^'"]*get-locators/;

  const workflowFiles = readdirSync(workflowsDir).filter((f) =>
    f.endsWith('.yml'),
  );

  const scriptRefs = new Set<string>();
  for (const file of workflowFiles) {
    const content = readFileSync(resolve(workflowsDir, file), 'utf8');
    const matches = content.matchAll(/npx tsx scripts\/([\w.-]+\.ts)/g);
    for (const m of matches) {
      scriptRefs.add(m[1]);
    }
  }

  it('finds at least one script invoked from a workflow', () => {
    expect(scriptRefs.size).toBeGreaterThan(0);
  });

  it('no workflow-invoked script fetches the legacy get-locators endpoint', () => {
    const offenders: string[] = [];
    for (const scriptName of scriptRefs) {
      const content = readFileSync(resolve(scriptsDir, scriptName), 'utf8');
      if (legacyLocatorsFetch.test(content)) {
        offenders.push(scriptName);
      }
    }
    expect(offenders).toEqual([]);
  });
});
