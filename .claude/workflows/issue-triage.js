export const meta = {
  name: 'evoyage-issue-triage',
  description: 'Re-verify every backlog item in EVOYAGE_AUDIT_PLAN.md against current HEAD, then adversarially confirm each still-open finding',
  phases: [
    { title: 'Triage', detail: 'One agent per backlog dimension re-checks its items against live code' },
    { title: 'Verify', detail: 'Adversarial skeptic per still-open finding — refute or confirm' },
  ],
}

const REPO = '/Users/edwardpham/Documents/Programming/Projects/evoyage'

const BASELINE = `
GROUND TRUTH measured in-session on 2026-09-30 at HEAD a00e34e (branch main). Trust these over any doc:
- npm test: 1467 tests / 133 files, ALL PASS
- npx tsc --noEmit: 0 errors  (the audit doc's claim of "106 TypeScript errors" is STALE/FIXED)
- npx next build: PASSES
- npx eslint src scripts: 32 problems (14 errors, 18 warnings)
- gh issue list --state open: 0 open GitHub issues (backlog lives in markdown, not GitHub)
- package.json version: 0.9.0  (audit was written against 0.8.0)
- Open PRs: #75 #73 #67 #64 (dependabot), #49 #48 (automation bots)
- Uncommitted WIP in working tree: Cloudflare-challenge detection for the VinFast browser poll
  (scripts/poll-vinfast-station-status.ts, src/lib/station/vinfast-browser-client.ts,
   src/lib/station/vinfast-upstream-error.ts + their .test.ts). Treat as in-flight, do not undo.
`

const RULES = `
HARD RULES:
1. You are READ-ONLY. Do not edit, create, or delete any file. Investigation only.
2. Every finding MUST carry evidence as a real file:line you actually opened, or the exact command
   you ran plus its real output. NO evidence = do not report the finding at all.
3. The audit doc EVOYAGE_AUDIT_PLAN.md is dated 2026-05-24 — FOUR MONTHS STALE. Many items are
   already fixed. Your primary job is to separate STILL_OPEN from ALREADY_FIXED. Defaulting to
   "still open" without checking the live code is the single worst failure mode here.
4. If an item is fixed, say ALREADY_FIXED and cite the code that fixes it. That is a success, not a gap.
5. Never guess a line number. Open the file and read it.
6. Report the severity YOU measure now, not the severity the stale doc asserted.
`

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Backlog id like C22, B3, QA-3, or NEW-1 for something you discovered' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['STILL_OPEN', 'PARTIAL', 'ALREADY_FIXED', 'OBSOLETE'] },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          evidence: { type: 'string', description: 'file:line you opened, or command + real output' },
          files: { type: 'array', items: { type: 'string' } },
          fix: { type: 'string', description: 'Concrete fix. Empty if already fixed.' },
          regressionRisk: { type: 'string', description: 'What working feature could this fix break, and which existing test would catch it' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
        },
        required: ['id', 'title', 'status', 'severity', 'evidence', 'fix', 'regressionRisk', 'effort'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    confirmed: { type: 'boolean', description: 'true = the finding survives refutation and is genuinely open' },
    reason: { type: 'string' },
    correctedStatus: { type: 'string', enum: ['STILL_OPEN', 'PARTIAL', 'ALREADY_FIXED', 'OBSOLETE'] },
    correctedSeverity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
  },
  required: ['confirmed', 'reason', 'correctedStatus', 'correctedSeverity'],
}

const DIMENSIONS = [
  {
    key: 'ci-actions',
    prompt: `Re-verify backlog items C1 through C11 (GitHub Actions / CI) from ${REPO}/EVOYAGE_AUDIT_PLAN.md section C.1.
Read that section first (grep for "### C.1" and read ~20 lines past it).
Then check the LIVE state of each: read every file in .github/workflows/, read scripts/refresh-vinfast-cookies.ts,
check .github/dependabot.yml exists (C8), and run these to check repo settings:
  gh api repos/duypham9895/evoyage/branches/main/protection 2>&1 | head -5     (C3)
  gh api repos/duypham9895/evoyage --jq '.delete_branch_on_merge'              (C9)
  gh run list --limit 40 --json name,conclusion,createdAt                      (C1, C2 — are these still failing NOW?)
Note: dependabot PRs #75 #73 #67 #64 are open, which is strong evidence about C8.
Report one finding per item C1..C11.`,
  },
  {
    key: 'data-layer',
    prompt: `Re-verify backlog items C12 through C21 (Supabase / Prisma data layer) from ${REPO}/EVOYAGE_AUDIT_PLAN.md section C.2.
Read that section, then check live state: prisma/schema.prisma (C12 RouteCache expiresAt, C15 ShortUrl.expiresAt,
C16 VinFastStationDetail pruning), docs/RECOVERY.md (C13 — does it cover crawl-evpower-stations.ts,
crawl-energy-prices.ts, seed-manual-stations.ts?), .env.example (C14 — list which of the ~10 named vars are
actually present now), package.json scripts (C17 db:push guard), CI for a prisma migrate diff gate (C18),
src/lib/station/poll-status.ts (C19 JSON.parse try/catch — check whether safe-json is used now),
and any cron schedule docs (C21).
Report one finding per item C12..C21.`,
  },
  {
    key: 'code-security',
    prompt: `Re-verify backlog items C22, C23, C24, C25, C26 (the security + config code-level issues) from
${REPO}/EVOYAGE_AUDIT_PLAN.md section C.3. These are the highest-stakes items in the whole backlog.
Check live state carefully:
- C22: src/app/api/transcribe/route.ts — is there a rate limit NOW? Compare against how
  src/app/api/evi/parse/route.ts does it. Read both fully.
- C23: vercel.json — is there a "crons" array? Which cron routes exist under src/app/api/cron/?
- C24: next.config.ts CSP headers + src/app/page.tsx jsonLd dangerouslySetInnerHTML. Is unsafe-inline
  still present? Is the JSON escaped? Is there a nonce middleware (check middleware.ts)?
- C25: grep -rn "console.log" src/ --include=*.ts --include=*.tsx | grep -v test  — how many remain, where?
- C26: package.json engines field present?
Also do a FRESH security sweep beyond the audit: grep for hardcoded secrets, unvalidated user input reaching
a DB or fetch call, missing auth on admin routes (src/app/api/admin/**, src/app/admin/**), and any new
unrate-limited paid-API endpoint. Report those as NEW-SEC-1, NEW-SEC-2, ...`,
  },
  {
    key: 'code-quality-tests',
    prompt: `Re-verify backlog items C27 and C28 (missing colocated API route tests) from ${REPO}/EVOYAGE_AUDIT_PLAN.md
section C.3, and audit current lint health.
- For C27/C28: for EACH of src/app/api/transcribe/route.ts, src/app/api/route/route.ts,
  src/app/api/stations/route.ts, src/app/api/feedback/route.ts, src/app/api/short-url/route.ts,
  src/app/api/vehicles/route.ts, and the three src/app/api/cron/* routes — check whether a colocated
  route.test.ts exists now. List exactly which are still untested.
- Then run: npx eslint src scripts 2>&1 | tail -60
  and catalogue ALL 32 problems (14 errors, 18 warnings) with file:line and rule. Group them.
  Report the eslint errors as NEW-LINT-1..N (one finding per RULE, not per occurrence — list the
  occurrences inside evidence).
- Note whether eslint currently runs in CI at all (read .github/workflows/*.yml) and whether the
  pre-commit hook (.husky/) enforces it.`,
  },
  {
    key: 'design-compliance',
    prompt: `Re-verify backlog items C29, C30, C31, C32 and the six QA-FINDINGS.md findings (report those as QA-1..QA-6)
against live code in ${REPO}.
Read ${REPO}/QA-FINDINGS.md and ${REPO}/DESIGN.md and the "Less Icons, More Humanity" section of
${REPO}/CLAUDE.md first.
- C29 / QA-1 / QA-2: emoji in interactive elements. Run:
    grep -rnP "[\\x{1F300}-\\x{1FAFF}\\x{2600}-\\x{27BF}]" src/components src/app --include=*.tsx
  and also check src/components/trip/AddCustomVehicle.tsx and the vehicle filter buttons + selected
  vehicle card specifically. For each hit decide: is it in an interactive element (violation) or in
  user-facing content text (allowed)?
- C30 / QA-3: grep -rn "edwardpham94" src/ — is the footer GitHub URL still wrong?
- C31 / QA-5: hero image alt text — does it switch on locale? Find the hero image component.
- C32 / QA-6: MapLocateButton hydration mismatch — read the component, is it guarded now?
- QA-4: page <title> locale switching — check src/components/LocaleTitleSync.tsx (audit B19 says it exists now).
Also sweep for NEW DESIGN.md violations not in the audit: decorative icon grids, emoji in tabs/nav.
Report those as NEW-DESIGN-1..N.`,
  },
  {
    key: 'missing-features',
    prompt: `Re-verify backlog items B1 through B15 (originally-requested features that were missing/partial/uncertain)
from ${REPO}/EVOYAGE_AUDIT_PLAN.md section B.1. Read that section first.
Check live state:
- B1/B13: feedback image upload. grep -rn "imageUrl" src/ prisma/. Note src/app/api/feedback/upload/route.ts
  APPEARS IN THE CURRENT BUILD OUTPUT — so this may now be shipped. Verify the full path: UI uploader
  component -> API route -> DB field -> admin viewer.
- B2: trackPageView — grep -rn "trackPageView" src/ . Defined-but-0-callers was the finding. Still true?
- B3: trackEviMessage — same treatment. Check src/hooks/useEVi.ts.
- B4/B5/B6: ADR-0003/0004/0005 execution. Read each ADR in docs/adr/, then measure the live shape:
  wc -l on src/app/api/route/route.ts, src/app/api/evi/parse/route.ts, src/lib/vinfast/*, and check
  whether an evi-trip-extractor module exists in src/lib/evi/.
- B11: react-hooks set-state-in-effect. Run: npx eslint src 2>&1 | grep -c "set-state-in-effect"
  and list each remaining site. The audit said 6 violations.
- B14: TripNotebook depth vs its spec — wc -l the components, skim the spec in docs/plans/.
- B15/B26: does the referenced design doc file exist? (audit says no)
B7, B8, B9 are legitimate DATA-GATED deferrals — but today is 2026-09-30 and their gates were
~2026-06-02 and ~2026-06-22. THE GATES HAVE ALL PASSED. Report each as STILL_OPEN with severity
reflecting that the gate cleared ~3-4 months ago and the work is now actionable, not deferred.`,
  },
  {
    key: 'doc-drift',
    prompt: `Re-verify backlog items B16 through B26 (scope-creep candidates + documentation drift) from
${REPO}/EVOYAGE_AUDIT_PLAN.md sections B.2 and B.3, against live files.
- B16..B20: do these undocumented components still exist (src/components/EViNudge.tsx, SampleTripChips.tsx,
  AddCustomVehicle.tsx, LocaleTitleSync.tsx, feedback/StarRating.tsx)? Are they NOW documented in
  CHANGELOG.md / CONTEXT.md / an ADR? Report as STILL_OPEN only if still undocumented.
- B21..B26 documentation drift — check each claim against reality. GROUND TRUTH: the suite is now
  1467 tests / 133 files. Check what README.md, CLAUDE.md, ARCHITECTURE.md and CONTEXT.md each claim.
  grep -rn "1237\\|728 tests\\|690\\|63 t.nh\\|MiniMax" README.md CLAUDE.md ARCHITECTURE.md CONTEXT.md
- B24: ARCHITECTURE.md missing API routes. The REAL current route list from the build is:
  /api/admin/feedback/[id], /api/cron/aggregate-popularity, /api/cron/aggregate-reliability,
  /api/cron/poll-station-status, /api/evi/parse, /api/evi/suggestions, /api/feedback,
  /api/feedback/upload, /api/route, /api/route/narrative, /api/share-card, /api/short-url,
  /api/stations, /api/stations/[id]/amenities, /api/stations/[id]/status-report,
  /api/stations/[id]/vinfast-detail, /api/stations/nearby, /api/transcribe, /api/vehicles.
  Diff that against ARCHITECTURE.md and report exactly which are undocumented.
- B25: CHANGELOG.md — what is the latest version entry vs package.json 0.9.0?
- Also check TODOS.md: its four gated items had target dates of ~2026-05-22 to ~2026-06-22.
  Today is 2026-09-30. Report the staleness as a finding.`,
  },
  {
    key: 'runtime-correctness',
    prompt: `FRESH BUG HUNT in ${REPO} — do not just re-read the audit; find real correctness bugs it never caught.
Focus on the trip-planning core, which is the product's whole value:
  src/lib/routing/, src/lib/trip/, src/lib/station/, src/lib/geo/, src/app/api/route/route.ts
Hunt specifically for:
- Unhandled promise rejections / missing try-catch around external calls (OSRM, Mapbox, VinFast, OpenAI)
- Off-by-one or unit-mix bugs (km vs m, Wh vs kWh, %, seconds vs minutes)
- Division by zero / NaN propagation in range, cost, and efficiency math
- Null/undefined dereferences on optional API fields
- Race conditions in SSE streaming (src/lib/station/ vinfast detail) and in React effects
- Silent catch blocks that swallow errors ( catch {} or catch(e){} with empty body )
- Timezone / date handling bugs (Vietnam is UTC+7 — check any date math in cron aggregation)
For each bug give the exact failing input and the wrong output. Report as NEW-BUG-1..N.
Prefer 6 genuinely reproducible bugs over 30 speculative ones. If you cannot state a concrete
failing input, DROP the finding.`,
  },
  {
    key: 'ops-resilience',
    prompt: `FRESH AUDIT of operational resilience in ${REPO} — the parts that break silently in production.
Examine:
- Every file in scripts/ (the crawlers, seeders, pollers). What happens on partial failure? Do they
  leave the DB in a half-written state? Is there any transaction boundary?
- src/app/api/cron/* — are these idempotent? What if the scheduler double-fires? Is CRON_SECRET checked
  on all three? Read each fully.
- Rate limiting: grep -rn "checkRateLimit\\|Ratelimit" src/ — which public endpoints have it, which do NOT.
  Build a complete table of every route under src/app/api/ and whether it is rate limited.
- External dependency failure modes: what does the user actually SEE when OSRM 502s (that was the
  documented QA blocker), when Mapbox is down, when the LLM provider chain exhausts? Trace the error
  path to the UI.
- Caching: is there any unbounded cache growth beyond RouteCache (audit C12)?
Report as NEW-OPS-1..N with concrete evidence.`,
  },
  {
    key: 'agent-infra',
    prompt: `AUDIT THE AGENT INFRASTRUCTURE ITSELF in ${REPO}. This is a confirmed defect — verify and characterise it fully.
FACT ALREADY ESTABLISHED: all 9 files in .claude/agents/ begin with a markdown H1 (e.g. "# QA Lead Agent")
and have NO YAML frontmatter. Claude Code only registers a subagent when the file starts with a
frontmatter block containing at least 'name:' and 'description:'. Consequence: none of these 9 agents
are loadable — they are inert prose.
Your job:
1. Confirm this for each of the 9 files (cat the first 5 lines of each) and report as ONE finding
   AGENT-1 with all 9 listed in evidence.
2. Read .claude/docs/agents.md fully. It documents the roster AND references "Technical Reviewers
   (from Layer 0)" — check whether those referenced agents exist anywhere. Report broken references.
3. Read docs/agents/issue-tracker.md, docs/agents/triage-labels.md, docs/agents/domain.md.
   CLAUDE.md tells agents the issue tracker is GitHub issues — but there are ZERO open GitHub issues
   and the real backlog is in EVOYAGE_AUDIT_PLAN.md. Report this mismatch as AGENT-2: any agent
   following CLAUDE.md would conclude there is no work to do.
4. Check .claude/skills/ — list each skill dir and whether it has a valid SKILL.md with frontmatter.
5. Check for a .claude/settings.json / settings.local.json and any hooks. Report what is and is not wired.
6. Check .claude/worktrees/ — are there stale worktrees left over from the 2026-05-01 multi-agent build
   (the IMPROVEMENTS-REPORT.md mentions 5 preserved worktrees)? Run: git worktree list
Report each as AGENT-N.`,
  },
]

phase('Triage')
log(`Re-verifying ~60 backlog items across ${DIMENSIONS.length} dimensions against live HEAD`)

const triaged = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(
      `You are triaging the eVoyage codebase at ${REPO}.\n\n${BASELINE}\n${RULES}\n\nYOUR DIMENSION: ${d.key}\n\n${d.prompt}`,
      { label: `triage:${d.key}`, phase: 'Triage', schema: TRIAGE_SCHEMA },
    ),
  (result, d) => {
    if (!result) return []
    const open = result.findings.filter(
      (f) => f.status === 'STILL_OPEN' || f.status === 'PARTIAL',
    )
    const closed = result.findings.filter(
      (f) => f.status === 'ALREADY_FIXED' || f.status === 'OBSOLETE',
    )
    if (!open.length) return closed.map((f) => ({ ...f, dimension: d.key, confirmed: true, verified: false }))
    return parallel(
      open.map((f) => () =>
        agent(
          `You are an adversarial verifier. Your job is to REFUTE the finding below, not to agree with it.\n\n` +
            `Repo: ${REPO}\n${BASELINE}\n\n` +
            `CLAIMED FINDING\n` +
            `id: ${f.id}\n` +
            `title: ${f.title}\n` +
            `status: ${f.status}\n` +
            `severity: ${f.severity}\n` +
            `evidence offered: ${f.evidence}\n` +
            `files: ${(f.files || []).join(', ')}\n` +
            `proposed fix: ${f.fix}\n\n` +
            `Open every file cited and check the claim yourself. Try hard to prove it WRONG. Common ways these claims fail:\n` +
            `  - The issue was already fixed in the 4 months since the audit was written, and the triager read the stale doc rather than the code.\n` +
            `  - The cited line number is wrong or the file moved.\n` +
            `  - The "problem" is intentional and documented in an ADR under docs/adr/ or in CLAUDE.md.\n` +
            `  - It is a test file, a script, or dev-only code where the rule does not apply.\n` +
            `  - The severity is inflated — a P3 cosmetic issue dressed up as P1.\n` +
            `Set confirmed=false if you refute it OR if you cannot independently reproduce the evidence.\n` +
            `Default to confirmed=false when genuinely uncertain. A false "confirmed" costs real engineering time.\n` +
            `You are READ-ONLY: do not modify any file.`,
          { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT_SCHEMA },
        ).then((v) => ({
          ...f,
          dimension: d.key,
          verified: true,
          confirmed: v ? v.confirmed : false,
          verifierReason: v ? v.reason : 'verifier died',
          status: v && v.correctedStatus ? v.correctedStatus : f.status,
          severity: v && v.correctedSeverity ? v.correctedSeverity : f.severity,
        })),
      ),
    ).then((verified) => [
      ...verified.filter(Boolean),
      ...closed.map((f) => ({ ...f, dimension: d.key, confirmed: true, verified: false })),
    ])
  },
)

const all = triaged.filter(Boolean).flat().filter(Boolean)
const openConfirmed = all.filter(
  (f) => f.confirmed && (f.status === 'STILL_OPEN' || f.status === 'PARTIAL'),
)
const refuted = all.filter((f) => f.verified && !f.confirmed)
const alreadyFixed = all.filter(
  (f) => f.status === 'ALREADY_FIXED' || f.status === 'OBSOLETE',
)

log(`Confirmed open: ${openConfirmed.length} · refuted by verifier: ${refuted.length} · already fixed: ${alreadyFixed.length}`)

return {
  confirmedOpen: openConfirmed,
  refuted: refuted.map((f) => ({ id: f.id, title: f.title, why: f.verifierReason })),
  alreadyFixed: alreadyFixed.map((f) => ({ id: f.id, title: f.title, evidence: f.evidence })),
  counts: {
    total: all.length,
    open: openConfirmed.length,
    refuted: refuted.length,
    fixed: alreadyFixed.length,
  },
}
