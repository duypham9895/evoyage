/**
 * Behavioural tests for the shell in the two crawl workflows.
 *
 * The `run:` text is extracted from the real YAML (same string-slicing approach
 * as deploy-quality-gates.test.ts — no YAML dependency) and executed with
 * `bash -e`, the shell GitHub Actions uses, against stub `gh`, `git` and
 * `sleep` on PATH. Until now every claim about these steps rested on a human
 * running them by hand in a scratch directory; these are the same traces, run
 * by the required check.
 *
 * ONE transformation is applied to the extracted text: Actions expressions
 * (`${{ … }}`) are replaced with a placeholder, because bash cannot parse them.
 * Nothing else is rewritten.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, chmodSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const root = resolve(__dirname, '../../..');
const workflow = (file: string) =>
  readFileSync(resolve(root, '.github/workflows', file), 'utf8');

const BASH = '/bin/bash';
const hasBash = existsSync(BASH);

/** The dedented body of a step's `run:` block, with Actions expressions stubbed. */
function runBlock(yml: string, stepName: string): string {
  const start = yml.indexOf(`- name: ${stepName}\n`);
  expect(start, `step "${stepName}" exists`).toBeGreaterThanOrEqual(0);
  const next = yml.indexOf('\n      - name: ', start + 1);
  const step = yml.slice(start, next === -1 ? undefined : next);
  const runAt = step.indexOf('run: |');
  expect(runAt, `step "${stepName}" has a run block`).toBeGreaterThanOrEqual(0);
  const lines = step.slice(step.indexOf('\n', runAt) + 1).split('\n');
  const indent = Math.min(
    ...lines.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length),
  );
  return lines
    .map((l) => l.slice(indent))
    .join('\n')
    .replace(/\$\{\{[^}]*\}\}/g, 'owner/repo');
}

const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'evoyage-wf-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'bin'));
  return dir;
}

function stub(dir: string, name: string, body: string): void {
  const path = join(dir, 'bin', name);
  writeFileSync(path, `#!/bin/bash\n${body}\n`, 'utf8');
  chmodSync(path, 0o755);
}

function runStep(
  dir: string,
  script: string,
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  writeFileSync(join(dir, 'step.sh'), script, 'utf8');
  const result = spawnSync(BASH, ['-e', join(dir, 'step.sh')], {
    cwd: dir,
    env: {
      NODE_ENV: 'test',
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      HOME: dir,
      RUNNER_TEMP: dir,
      ...env,
    },
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

/**
 * `gh` stub. GH_MODE drives `pr create`; every call is appended to calls.log so
 * the test can assert exactly what was invoked and with which argument.
 */
const GH_STUB = `
echo "$@" >> "$PWD/calls.log"
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  [ "$GH_MODE" = "listfail" ] && { echo "GraphQL: boom" >&2; exit 1; }
  [ "$GH_MODE" = "exists" ] && { echo "175"; exit 0; }
  echo ""
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  case "$GH_MODE" in
    createfail_url) echo "https://github.com/o/r/pull/999"; echo "GraphQL: boom" >&2; exit 1 ;;
    createfail_silent) echo "GraphQL: boom" >&2; exit 1 ;;
    create_empty) exit 0 ;;
    *) echo "https://github.com/o/r/pull/999"; exit 0 ;;
  esac
fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  echo "MERGE_ARG=[$3]" >> "$PWD/merge.log"
  [ "$GH_MODE" = "mergefail" ] && { echo "GraphQL: boom" >&2; exit 1; }
  exit 0
fi
exit 0
`;

const GIT_STUB = `
# "are there staged changes?" must answer yes so the step proceeds.
if [ "$1" = "diff" ]; then exit 1; fi
exit 0
`;

const SLEEP_STUB = `echo "slept $1" >> "$PWD/sleep.log"\nexit 0`;

// crawl-stations.yml reads the station count with `node -e`; there is no repo
// checkout in the temp workspace.
const NODE_STUB = `echo 12345\nexit 0`;

function prWorkspace(): { dir: string } {
  const dir = workspace();
  stub(dir, 'gh', GH_STUB);
  stub(dir, 'git', GIT_STUB);
  stub(dir, 'sleep', SLEEP_STUB);
  stub(dir, 'node', NODE_STUB);
  return { dir };
}

const PR_STEPS: ReadonlyArray<readonly [string, string]> = [
  ['crawl-energy-prices.yml', 'Open energy-prices sync PR'],
  ['crawl-stations.yml', 'Open station-stats sync PR'],
];

const log = (dir: string, name: string) =>
  existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : '';

describe.skipIf(!hasBash)('crawl workflows: the PR step under bash -e', () => {
  it.each(PR_STEPS)('%s / %s arms auto-merge with the URL gh printed', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), { GH_TOKEN: 'x', GH_MODE: 'ok' });

    expect(out.status).toBe(0);
    expect(log(dir, 'merge.log')).toBe('MERGE_ARG=[https://github.com/o/r/pull/999]\n');
  });

  it.each(PR_STEPS)('%s / %s aborts when gh pr create fails after printing a URL', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      GH_MODE: 'createfail_url',
    });

    expect(out.status).toBe(1);
    expect(out.stdout).toContain('::error::gh pr create failed');
    expect(log(dir, 'merge.log')).toBe('');
  });

  it.each(PR_STEPS)('%s / %s aborts when gh pr create fails printing nothing', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      GH_MODE: 'createfail_silent',
    });

    expect(out.status).toBe(1);
    expect(out.stdout).toContain('::error::gh pr create failed');
    expect(log(dir, 'merge.log')).toBe('');
  });

  // The empty-$pr guard: `gh pr merge ""` would resolve the current branch.
  it.each(PR_STEPS)('%s / %s never calls gh pr merge with an empty argument', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      GH_MODE: 'create_empty',
    });

    expect(out.status).toBe(1);
    expect(out.stdout).toContain('printed no URL');
    expect(log(dir, 'merge.log')).toBe('');
    expect(log(dir, 'merge.log')).not.toContain('MERGE_ARG=[]');
  });

  it.each(PR_STEPS)('%s / %s merges by number when the PR already exists', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      GH_MODE: 'exists',
    });

    expect(out.status).toBe(0);
    expect(log(dir, 'merge.log')).toBe('MERGE_ARG=[175]\n');
    expect(log(dir, 'calls.log')).not.toContain('pr create');
  });

  it.each(PR_STEPS)('%s / %s aborts when gh pr list itself fails', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      GH_MODE: 'listfail',
    });

    expect(out.status).toBe(1);
    expect(log(dir, 'merge.log')).toBe('');
    expect(log(dir, 'calls.log')).not.toContain('pr create');
  });

  it.each(PR_STEPS)('%s / %s retries merge three times and does not sleep after the last', (file, name) => {
    const { dir } = prWorkspace();
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      GH_MODE: 'mergefail',
    });

    expect(out.status).toBe(1);
    expect(log(dir, 'merge.log').trim().split('\n')).toHaveLength(3);
    expect(log(dir, 'sleep.log').trim().split('\n')).toEqual(['slept 10', 'slept 20']);
    expect(out.stdout).toContain('failed 3 times');
  });
});

// The step quotes `tail -3` of the matching lines, so each log holds exactly
// the three lines its assertions are about.
// Synthetic credentials, split so secret scanners do not flag the fixture.
const SECRETS_LOG = [
  '[crawl] starting',
  `PrismaClientInitializationError: Can't reach database server at ${'postgres' + 'ql'}://postgres.abc:S3cret@db.host:6543/postgres`,
  `Fatal error: fetch failed for ${'htt' + 'ps'}://user:hunter2@internal.example.com/x and error: retry exhausted`,
  '[energy-prices] EVN crawl failed: Error: EVN discovery: no residential tariff article among 5 candidate(s). Rejected: https://en.evn.com.vn/d/en-US/news/x-60-28-252 — EVN parser: residential retail tariff heading not found',
].join('\n');

const INJECTION_LOG = [
  '```',
  'error: ``` @duypham9895 @everyone [click](https://evil.example/x)',
  '@duypham9895 ping error: injected',
  'FATAL: ' + 'x'.repeat(900),
].join('\n');

const ISSUE_STEPS: ReadonlyArray<readonly [string, string]> = [
  ['crawl-energy-prices.yml', 'Open or update failure issue'],
  ['crawl-stations.yml', 'Open or update failure issue'],
];

const ISSUE_GH_STUB = `
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then echo ""; exit 0; fi
if [ "$1" = "issue" ] && { [ "$2" = "create" ] || [ "$2" = "comment" ]; }; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--body" ]; then printf '%s' "$2" > "$PWD/body.txt"; fi
    shift
  done
  exit 0
fi
exit 0
`;

const RUN_URL = 'https://github.com/duypham9895/evoyage/actions/runs/123';

describe.skipIf(!hasBash)('crawl workflows: the failure-issue step under bash -e', () => {
  function runIssueStep(file: string, name: string, logContent: string) {
    const dir = workspace();
    stub(dir, 'gh', ISSUE_GH_STUB);
    writeFileSync(join(dir, 'crawl.log'), `${logContent}\n`, 'utf8');
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      WORKFLOW_NAME: 'Crawl Energy Prices',
      RUN_URL,
    });
    return { out, body: log(dir, 'body.txt') };
  }

  it.each(ISSUE_STEPS)('%s redacts database and credentialed URLs but keeps plain ones', (file, name) => {
    const { out, body } = runIssueStep(file, name, SECRETS_LOG);

    expect(out.status).toBe(0);
    expect(body).not.toContain('S3cret');
    expect(body).not.toContain('hunter2');
    expect(body).toContain('<redacted-db-url>');
    expect(body).toContain('<redacted-credentials>');
    // The diagnostic that says WHICH article failed must survive (W6).
    expect(body).toContain('https://en.evn.com.vn/d/en-US/news/x-60-28-252');
  });

  it.each(ISSUE_STEPS)('%s keeps the run URL unredacted', (file, name) => {
    const { body } = runIssueStep(file, name, SECRETS_LOG);
    expect(body).toContain(RUN_URL);
  });

  it.each(ISSUE_STEPS)('%s never captures a bare code fence, so the quote cannot escape', (file, name) => {
    const { body } = runIssueStep(file, name, INJECTION_LOG);

    // A CommonMark fence closes only on a line that is nothing but backticks.
    // The hostile log contains a bare ``` line (never captured, it matches no
    // grep keyword) and a ``` mid-line (captured, and inert). Neither closes
    // the block, so the @mentions stay inside it and GitHub does not notify.
    const quoted = body.slice(body.indexOf('```') + 3, body.lastIndexOf('```'));
    const capturedLines = quoted.split('\n').filter((l) => l !== '');
    expect(capturedLines.length).toBeGreaterThan(0);
    expect(capturedLines.every((l) => !/^\s*`{3,}\s*$/.test(l))).toBe(true);
    expect(capturedLines.some((l) => l.includes('@duypham9895'))).toBe(true);
  });

  it.each(ISSUE_STEPS)('%s caps every quoted line', (file, name) => {
    const { body } = runIssueStep(file, name, INJECTION_LOG);
    for (const line of body.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(400);
    }
  });

  it.each(ISSUE_STEPS)('%s falls back to a placeholder when no log exists', (file, name) => {
    const dir = workspace();
    stub(dir, 'gh', ISSUE_GH_STUB);
    const out = runStep(dir, runBlock(workflow(file), name), {
      GH_TOKEN: 'x',
      WORKFLOW_NAME: 'Crawl Energy Prices',
      RUN_URL,
    });

    expect(out.status).toBe(0);
    expect(log(dir, 'body.txt')).toContain('no error line captured');
  });
});

export { runBlock };
