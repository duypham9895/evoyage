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

// docs/bugs/2026-11-12-p1-energy-crawl-evn-tariff-restructure.md, review rounds
// 1-3. Each of these was a real defect, and each was left enforced only by a
// code comment ("do not widen this", "pipefail matters here"). Behaviour is
// tested in crawl-workflow-steps.test.ts; these assertions stop the control
// from being deleted outright, which that suite could not distinguish from a
// deliberate rewrite.
const crawlWorkflows = ['crawl-energy-prices.yml', 'crawl-stations.yml'] as const;

describe('crawl workflows keep their failure-reporting controls', () => {
  it.each(crawlWorkflows)('%s sets pipefail in the tee\'d crawl step and in the PR step', (file) => {
    const content = read(file);

    // GitHub runs `run:` as `bash -e` — errexit WITHOUT pipefail. Both steps
    // pipe (`npx … | tee`, `gh pr create … | tail -1`), so without this a
    // failing command on the left of the pipe is swallowed.
    expect(content).toContain('| tee "${RUNNER_TEMP}/crawl.log"');
    expect(content.match(/set -o pipefail/g) ?? []).toHaveLength(2);
  });

  it.each(crawlWorkflows)('%s refuses to call gh pr merge without a PR', (file) => {
    const content = read(file);

    expect(content).toContain('::error::gh pr create failed');
    expect(content).toContain('if [ -z "$pr" ]; then');
    expect(content).toContain('gh pr create printed no URL');
  });

  it.each(crawlWorkflows)('%s redacts credentials from the quoted log lines', (file) => {
    const content = read(file);

    expect(content).toContain("s#postgres(ql)?://[^[:space:]]*#<redacted-db-url>#g");
    expect(content).toContain(
      "s#(https?)://[^/@[:space:]]*:[^@[:space:]]*@[^[:space:]]*#\\1://<redacted-credentials>#g",
    );
    expect(content).toContain('cut -c1-400');
    // The run URL is a separate printf argument and must never be piped
    // through sed, or the alert loses the link to the run.
    expect(content).not.toMatch(/RUN_URL.*\|\s*sed/);
  });

  it.each(crawlWorkflows)('%s keeps the issue-quote grep narrow', (file) => {
    const content = read(file);

    // This repo is public and the quoted text is upstream-controlled. The
    // pattern being line-based and narrow is what stops a line that is only
    // ``` from closing the code fence in the issue body. Widening it, or
    // adding -A/-B context, needs real escaping instead.
    expect(content).toContain("grep -aE 'Error|FAILED|FATAL|error:'");
    expect(content).not.toMatch(/grep -a?E? .*-[AB] ?\d/);
  });
});
