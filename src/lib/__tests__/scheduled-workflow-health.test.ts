import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md:
// - Finding A: the aggregate workflows only grepped for '"ok":false', so a
//   non-JSON body or a run that upserted 0 rows stayed green.
// - Finding C: no scheduled workflow told anyone when it failed; the poller
//   failed 4-6 times a day for a month with nobody alerted.
const workflowsDir = resolve(__dirname, '../../../.github/workflows');
const read = (file: string) => readFileSync(resolve(workflowsDir, file), 'utf8');

const scheduledWorkflows = readdirSync(workflowsDir)
  .filter((f) => f.endsWith('.yml'))
  .filter((f) => /^\s*schedule:/m.test(read(f)));

describe('aggregate workflows fail on an unhealthy body', () => {
  it.each([
    ['aggregate-popularity.yml', 'popularityRowsUpserted'],
    ['aggregate-reliability.yml', 'stationsUpserted'],
  ])('%s requires ok == true and %s > 0 via jq -e', (file, countField) => {
    const content = read(file);

    expect(content).toContain(`jq -e '.ok == true and .${countField} > 0'`);
    expect(content).not.toContain(`grep -q '"ok":false'`);
  });
});

describe('scheduled workflows alert on failure', () => {
  it('finds the scheduled workflows', () => {
    expect(scheduledWorkflows).toEqual(
      expect.arrayContaining([
        'aggregate-popularity.yml',
        'aggregate-reliability.yml',
        'poll-station-status.yml',
      ]),
    );
  });

  it.each(scheduledWorkflows)('%s grants issues: write', (file) => {
    const permissions = read(file).match(/^permissions:\n((?: {2}.*\n)+)/m)?.[1] ?? '';

    expect(permissions).toMatch(/^ {2}issues: write$/m);
  });

  it.each(scheduledWorkflows)(
    '%s opens or comments on a GitHub issue when a scheduled run fails',
    (file) => {
      const content = read(file);

      expect(content).toContain("if: failure() && github.event_name == 'schedule'");
      expect(content).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
      expect(content).toContain('gh issue list');
      expect(content).toContain('gh issue comment');
      expect(content).toContain('gh issue create');
    },
  );
});
