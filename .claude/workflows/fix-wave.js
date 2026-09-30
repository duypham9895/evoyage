export const meta = {
  name: 'fix-wave',
  description: 'Fix a batch of triaged findings in isolated worktrees, verify each in place, then adversarially review every diff before anything reaches main',
  whenToUse:
    'After issue-triage produces confirmed findings. Pass them as args: an array of {id, title, severity, files, fix, regressionRisk}.',
  phases: [
    { title: 'Fix', detail: 'One agent per finding, each in its own git worktree' },
    { title: 'Review', detail: 'Independent reviewer reads each diff cold and tries to reject it' },
  ],
}

const REPO = '/Users/edwardpham/Documents/Programming/Projects/evoyage'

const findings = Array.isArray(args) ? args : args && args.findings ? args.findings : []
// Worktree isolation branches from HEAD, so it DROPS uncommitted work. Pass
// {isolate:false} when the fixes depend on work still in the working tree — then file
// sets per finding MUST be disjoint, which is what actually prevents collisions.
const isolate = Array.isArray(args) ? true : args && args.isolate === false ? false : true

if (!findings.length) {
  log('No findings passed in args — nothing to fix.')
  return { fixed: [], rejected: [], note: 'fix-wave called with an empty finding list' }
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    applied: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    diffSummary: { type: 'string' },
    testsAdded: { type: 'array', items: { type: 'string' } },
    verification: { type: 'string', description: 'Real output of npm test and tsc, verbatim' },
    abandonedReason: { type: 'string', description: 'If applied=false, exactly why' },
  },
  required: ['id', 'applied', 'filesChanged', 'diffSummary', 'verification'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    accept: { type: 'boolean' },
    severity: { type: 'string', enum: ['none', 'minor', 'major', 'blocker'] },
    problems: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['accept', 'severity', 'problems', 'reasoning'],
}

const SHARED_RULES = `
PROJECT RULES that override your defaults (from CLAUDE.md, which you already have):
- Karpathy guidelines are MANDATORY. Simplest change that solves the stated problem.
  No speculative features, no abstractions for imagined futures, no "while I'm here" refactors.
- SURGICAL: touch only what this finding names. Do not reformat, reorder, or improve adjacent code.
  If you spot an unrelated problem, REPORT it in diffSummary — do not fix it.
- TDD: for a bug fix, write the failing test FIRST, watch it fail, then fix it.
- Tests are COLOCATED: src/lib/foo.ts -> src/lib/foo.test.ts
- Locale keys must go in BOTH src/locales/en.json and src/locales/vi.json.
- DESIGN.md governs all visual choices. No emoji in interactive elements.
- No console.log left in production code.
- Never delete a test to make a suite pass.
`

phase('Fix')
log(`Fixing ${findings.length} confirmed findings, one isolated worktree each`)

const results = await pipeline(
  findings,
  (f) =>
    agent(
      `Fix exactly this ONE finding in the eVoyage repo. Nothing else.\n\n` +
        `FINDING ${f.id} [${f.severity}]\n` +
        `Title: ${f.title}\n` +
        `Files implicated: ${(f.files || []).join(', ') || '(discover them yourself)'}\n` +
        `Proposed fix: ${f.fix}\n` +
        `Known regression risk: ${f.regressionRisk || 'not stated — assess it yourself'}\n\n` +
        SHARED_RULES +
        `\nPROCEDURE:\n` +
        `1. Read the implicated files fully before changing anything.\n` +
        `2. Check whether the repo ALREADY solves this problem somewhere else. If a tested, working\n` +
        `   implementation exists, REUSE it rather than writing a second one. Duplicated logic that\n` +
        `   drifts apart is how this bug class got here in the first place.\n` +
        `3. Write or update the test first. Run it. Confirm it fails for the right reason.\n` +
        `4. Make the minimal change that passes it.\n` +
        `5. Run 'npm test' and 'npx tsc --noEmit'. Paste the REAL output into verification.\n` +
        `   If node_modules is missing, run 'npm ci' first.\n` +
        `6. If the full suite does not pass, set applied=false and explain. DO NOT commit a red suite.\n` +
        `   DO NOT weaken or delete an existing test to get green.\n\n` +
        `If on reading the code you conclude the finding is WRONG or already fixed, set applied=false\n` +
        `with abandonedReason. That is a correct and valuable outcome, not a failure.`,
      {
        label: `fix:${f.id}`,
        phase: 'Fix',
        schema: FIX_SCHEMA,
        ...(isolate ? { isolation: 'worktree' } : {}),
      },
    ),
  (fix, f) => {
    if (!fix || !fix.applied) {
      return {
        ...f,
        applied: false,
        abandonedReason: fix ? fix.abandonedReason : 'fix agent died',
        accepted: false,
      }
    }
    return agent(
      `Review this fix COLD and try to reject it. You did not write it and you owe it nothing.\n\n` +
        `Repo: ${REPO}\n` +
        `FINDING ${f.id} [${f.severity}]: ${f.title}\n` +
        `Intended fix: ${f.fix}\n\n` +
        `WHAT THE FIXER CLAIMS\n` +
        `Files changed: ${fix.filesChanged.join(', ')}\n` +
        `Diff summary: ${fix.diffSummary}\n` +
        `Tests added: ${(fix.testsAdded || []).join(', ') || 'none'}\n` +
        `Verification output: ${fix.verification}\n\n` +
        `Read the ACTUAL current state of every file listed and judge for yourself. Check specifically:\n` +
        `1. Does it actually fix the stated problem, or only the symptom?\n` +
        `2. Did it break a caller? grep for every consumer of anything whose signature or behaviour changed.\n` +
        `3. Is the test real — would it FAIL if the fix were reverted? A test that passes either way is worthless.\n` +
        `4. Scope creep: did it change anything the finding did not ask for?\n` +
        `5. Did it weaken or delete an existing test, or loosen a type, to get green?\n` +
        `6. New locale key in only one of en.json / vi.json?\n` +
        `7. Is the claimed verification output plausible, or does it look fabricated?\n\n` +
        `accept=false for anything major or blocker. Default to accept=false when uncertain —\n` +
        `a rejected good fix costs one retry; an accepted bad fix reaches production.\n` +
        `You are READ-ONLY.`,
      { label: `review:${f.id}`, phase: 'Review', schema: REVIEW_SCHEMA },
    ).then((r) => ({
      ...f,
      applied: true,
      filesChanged: fix.filesChanged,
      diffSummary: fix.diffSummary,
      verification: fix.verification,
      accepted: r ? r.accept : false,
      reviewSeverity: r ? r.severity : 'blocker',
      problems: r ? r.problems : ['reviewer died — treat as unreviewed'],
      reviewReasoning: r ? r.reasoning : '',
    }))
  },
)

const all = results.filter(Boolean)
const accepted = all.filter((r) => r.applied && r.accepted)
const rejected = all.filter((r) => r.applied && !r.accepted)
const abandoned = all.filter((r) => !r.applied)

log(`Accepted ${accepted.length} · rejected by review ${rejected.length} · abandoned ${abandoned.length}`)

return {
  accepted: accepted.map((r) => ({ id: r.id, title: r.title, filesChanged: r.filesChanged, diffSummary: r.diffSummary })),
  rejected: rejected.map((r) => ({ id: r.id, title: r.title, problems: r.problems, reasoning: r.reviewReasoning })),
  abandoned: abandoned.map((r) => ({ id: r.id, title: r.title, reason: r.abandonedReason })),
  counts: { accepted: accepted.length, rejected: rejected.length, abandoned: abandoned.length },
  note:
    'Fixes live in isolated worktrees. Nothing has been merged to main. Run regression-gate after integrating, and get Duy an explicit go before any push or deploy.',
}
