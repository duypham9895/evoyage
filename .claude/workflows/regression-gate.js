export const meta = {
  name: 'regression-gate',
  description: 'Prove a change broke nothing: full verification sweep plus targeted blast-radius review of the diff',
  whenToUse:
    'Before any commit, merge, or deploy. Run after a fix wave to prove the working features still work.',
  phases: [
    { title: 'Verify', detail: 'Tests, types, build, lint, locale parity, E2E — each with real output' },
    { title: 'BlastRadius', detail: 'One reviewer per touched subsystem hunts for regressions the tests would miss' },
  ],
}

const REPO = '/Users/edwardpham/Documents/Programming/Projects/evoyage'

// Baseline recorded 2026-09-30 @ a00e34e. Update when it legitimately moves.
const BASELINE = {
  tests: 1467,
  testFiles: 133,
  tsErrors: 5, // pre-existing test-fixture type drift; NOT zero
  lintProblems: 32,
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    check: { type: 'string' },
    passed: { type: 'boolean' },
    output: { type: 'string', description: 'The real command output, verbatim — not a summary' },
    regression: { type: 'boolean', description: 'true if this is WORSE than the recorded baseline' },
    detail: { type: 'string' },
  },
  required: ['check', 'passed', 'output', 'regression', 'detail'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    regressions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          summary: { type: 'string' },
          failureScenario: { type: 'string', description: 'Concrete input -> wrong output' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        },
        required: ['file', 'summary', 'failureScenario', 'severity'],
      },
    },
    verdict: { type: 'string', enum: ['SAFE', 'RISKY', 'BLOCKED'] },
    reasoning: { type: 'string' },
  },
  required: ['regressions', 'verdict', 'reasoning'],
}

const CHECKS = [
  {
    key: 'tests',
    cmd: 'npm test',
    expect: `All tests pass. Baseline is ${BASELINE.tests} tests across ${BASELINE.testFiles} files. A LOWER count is a regression — tests were deleted or stopped being collected.`,
  },
  {
    key: 'types',
    cmd: 'npx tsc --noEmit',
    expect: `Baseline ${BASELINE.tsErrors} pre-existing errors in test fixtures. MORE than ${BASELINE.tsErrors} is a regression; fewer is an improvement.`,
  },
  { key: 'build', cmd: 'npx next build', expect: 'Must succeed. Any failure is a blocker.' },
  {
    key: 'lint',
    cmd: 'npx eslint src scripts',
    expect: `Baseline ${BASELINE.lintProblems} problems. MORE than baseline is a regression; fewer is an improvement.`,
  },
  {
    key: 'locale',
    cmd: 'npx vitest run src/lib/__tests__/locale-keys.test.ts',
    expect: 'en.json and vi.json key sets and interpolation params must match exactly.',
  },
  {
    key: 'e2e',
    cmd: 'npx playwright test --reporter=line',
    expect:
      'E2E specs must pass. If Playwright browsers are not installed, report that honestly as a skipped check rather than a pass.',
  },
]

phase('Verify')
log('Running the full verification sweep against the recorded baseline')

const results = await parallel(
  CHECKS.map((c) => () =>
    agent(
      `Run exactly this command in ${REPO} and report the real result.\n\n` +
        `  cd ${REPO} && ${c.cmd}\n\n` +
        `Expectation: ${c.expect}\n\n` +
        `RULES:\n` +
        `- If node_modules is missing, run 'npm ci' first and say so in detail.\n` +
        `- Paste the REAL summary lines into 'output'. Never write output you did not see.\n` +
        `- If the command fails to run at all, passed=false and explain — a command that could not run is NOT a pass.\n` +
        `- Set regression=true only when the result is measurably WORSE than the stated baseline.\n` +
        `- Do not edit any file. Do not try to fix anything. Report only.`,
      { label: `check:${c.key}`, phase: 'Verify', schema: CHECK_SCHEMA },
    ),
  ),
)

const checks = results.filter(Boolean)
const failed = checks.filter((c) => !c.passed)
const regressed = checks.filter((c) => c.regression)

log(`Verification: ${checks.length - failed.length}/${checks.length} passed · ${regressed.length} regressions vs baseline`)

// Determine which subsystems the working diff actually touches.
phase('BlastRadius')

const SUBSYSTEMS = [
  { key: 'trip-planning', paths: 'src/lib/routing/ src/lib/trip/ src/app/api/route/' },
  { key: 'stations', paths: 'src/lib/station/ src/lib/stations/ src/app/api/stations/ scripts/' },
  { key: 'evi-ai', paths: 'src/lib/evi/ src/hooks/useEVi.ts src/app/api/evi/' },
  { key: 'ui-components', paths: 'src/components/ src/app/plan/ src/app/page.tsx' },
  { key: 'data-cron', paths: 'src/app/api/cron/ prisma/ .github/workflows/' },
]

const reviews = await parallel(
  SUBSYSTEMS.map((s) => () =>
    agent(
      `You are hunting for REGRESSIONS in the eVoyage subsystem "${s.key}" at ${REPO}.\n\n` +
        `First establish what actually changed:\n` +
        `  cd ${REPO} && git status --short && git diff -- ${s.paths} && git diff --cached -- ${s.paths}\n\n` +
        `If NOTHING in this subsystem changed, return verdict SAFE with an empty regressions array and say so. Do not invent work.\n\n` +
        `If something did change, your job is to find what the test suite would NOT catch:\n` +
        `- Behaviour that changed for an input no test covers\n` +
        `- An error path that used to be handled and now is not (or vice versa)\n` +
        `- A contract change that a CALLER outside this subsystem still depends on — grep for callers\n` +
        `- Removed or weakened validation, auth, or rate limiting\n` +
        `- A locale key referenced but not added to BOTH en.json and vi.json\n` +
        `- A DESIGN.md violation introduced in UI code (emoji or decorative icons in interactive elements)\n\n` +
        `Every regression needs a CONCRETE failure scenario: specific input -> specific wrong output.\n` +
        `If you cannot state one, drop the finding. Speculation is worse than silence here.\n` +
        `Verdict: SAFE (ship it), RISKY (ship with the named caveat), BLOCKED (do not ship).\n` +
        `You are READ-ONLY.`,
      { label: `blast:${s.key}`, phase: 'BlastRadius', schema: REVIEW_SCHEMA },
    ),
  ),
)

const allReviews = reviews.filter(Boolean)
const blockers = allReviews.flatMap((r) =>
  r.regressions.filter((g) => g.severity === 'P0' || g.severity === 'P1'),
)
const blocked = allReviews.some((r) => r.verdict === 'BLOCKED')

const verdict =
  failed.length || blocked || blockers.length ? 'BLOCKED' : regressed.length ? 'RISKY' : 'SAFE'

log(`Gate verdict: ${verdict}`)

return {
  verdict,
  checks: checks.map((c) => ({
    check: c.check,
    passed: c.passed,
    regression: c.regression,
    output: c.output,
  })),
  failedChecks: failed.map((c) => c.check),
  regressions: allReviews.flatMap((r) => r.regressions),
  subsystemVerdicts: allReviews.map((r) => ({ verdict: r.verdict, reasoning: r.reasoning })),
  note:
    'A SAFE verdict means the automated gate found nothing. It is NOT deploy approval — Duy gives that explicitly, per task.',
}
