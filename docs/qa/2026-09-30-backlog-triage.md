# eVoyage — Backlog Triage Report

**Run:** 2026-09-30 · HEAD `a00e34e` · branch `main` · v0.9.0  
**Method:** 10 parallel read-only triage agents over every backlog source, then one adversarial verifier per still-open finding, each prompted to *refute* rather than confirm.  
**Cost:** 87 agents · 6.64M tokens · 1,517 tool calls · 41 min · 0 agent errors

## Headline

| | |
|---|---:|
| Findings raised | 121 |
| **Confirmed open** | **61** |
| Already fixed since the audit | 53 |
| Killed by the adversarial verifier | 16 |

The audit document `EVOYAGE_AUDIT_PLAN.md` is dated 2026-05-24 against v0.8.0. The repo
is v0.9.0. **Most of its items are already fixed, and most of what is genuinely broken
today was never in it.** Verification before fixing was the single highest-value step:
53 items would have been re-fixed needlessly, and 16 verifier-rejected
findings would have become wasted or actively harmful work.

> There are **zero open GitHub issues**. `docs/agents/issue-tracker.md` names GitHub as
> the tracker, so any agent trusting it concludes there is no work to do.

## Confirmed open, by severity

| Severity | Count |
|---|---:|
| P1 | 6 |
| P2 | 25 |
| P3 | 30 |

No P0. The daily-failing crawl was raised as P0 and the verifier downgraded it to P1:
the pipeline is dead and silent, but production still serves ~20k stations, nothing is
down, and there is no data loss or security exposure. That is data drift, not an outage.

## P1 — 6 open

### `NEW-1` · Crawl Charging Stations workflow has failed 10 consecutive daily runs on VinFast 403; station data stale 4 months

**Area:** ci-actions · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** `gh run list --workflow=crawl-stations.yml --limit 10` → all 10 runs `failure`, daily 2026-09-21T05:55Z through 2026-09-30T06:18Z. `gh run view 36677523570 --log-failed` → "Fatal error: Error: VinFast API call failed with status: 403 at fetchVinFastLocators (scripts/crawl-vinfast-stations.ts:106:13) at async main (scripts/crawl-vinfast-stations.ts:255:23)"; step `Crawl VinFast stations` = failure, all 7 downstream steps = skipped. scripts/crawl-vinfast-stations.ts:106 `throw new Error(`VinFast API call failed with status: ${...}`)` and :339 `process.exit(1)` — no VinfastApiError typing. `grep -rn isRecoverableVinfastBrowserAccessError src scripts` → used at scripts/poll-vinfast-station-status.ts:81, absent from scripts/crawl-vinfast-stations.ts. `git log -1 -- src/data/station-stats.json` → 2026-05-31 e7c1e84, file content {"count":19951,"lastUpdated":"2026-05-31T01:48:44.310Z"}.

**Fix.** Route the crawler through the same hardening the other two VinFast scripts already use. In scripts/crawl-vinfast-stations.ts: import `normalizeVinfastBrowserError` + `VinfastApiError` and throw `new VinfastApiError('http_error', msg, status)` (or `'cloudflare_blocked'` when the IM_UNDER_ATTACK/challenge-platform branch at :98-100 fires) instead of the bare Error at :106; wrap the `page.goto`+`page.evaluate` block in try/catch calling `normalizeVinfastBrowserError`; add the 3-attempt retry loop that scripts/refresh-vinfast-cookies.ts:133-157 already implements. Separately decide the policy question: a 403 that persists for 10 days is a real upstream regression, so it should still fail …

**Regression risk.** Changing the crawler's throw type could reclassify a genuine outage as a skip and let `Sync README station count` run against a partial crawl, silently writing a too-low count to src/data/station-stats.json. Guard: the crawler must keep exiting non-zero on persistent failure. No existing test covers scripts/crawl-vinfast-stations.ts (no colocated .test.ts); src/lib/station/vinfast-upstream-error.test.ts covers the classifier helpers only, so it would NOT catch a wrong call-site wiring. Add a …

**Verifier.** Independently reproduced. gh run list --workflow=crawl-stations.yml --limit 100 shows 76 failures / 24 successes over 2026-06-23 to 2026-09-30, with the LAST SUCCESS on 2026-07-21T04:14Z — i.e. ~70 consecutive daily failures, worse than the claimed 10. gh run view 36677523570 --log-failed reproduces the exact 403 and stack at scripts/crawl-vinfast-stations.ts:106:13 / :255:23; job steps confirm step 7 failure and steps 8-14 (EVPower, OSM, OCM, manual CSV, crowdsourced promotion, README sync, stats PR) all skipped, so the entire six-source pipeline is dead because only the VinFast step lacks …

### `NEW-2` · Branch protection added for C3 permanently blocks the automation PRs — required check never runs for github-actions[bot]

**Area:** ci-actions · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** `gh pr list --state open` → #49 automation/energy-prices MERGEABLE/BLOCKED, #48 automation/stations MERGEABLE/BLOCKED. `gh pr view 49 --json createdAt,statusCheckRollup` → created 2026-06-02T04:34:35Z, updated 2026-09-29T09:31:20Z, statusCheckRollup contains ONLY {"name":"GitGuardian Security Checks","conclusion":"SUCCESS"} — no `Deploy to Vercel` entry. `gh api repos/duypham9895/evoyage/branches/main/protection` → required_status_checks.contexts = ["Deploy to Vercel"]. `gh run list --workflow=deploy.yml --limit 12` → 12 consecutive runs on headBranch automation/energy-prices, event pull_request, conclusion `action_required`, daily 2026-09-18 → 2026-09-29. `gh api repos/duypham9895/evoyage/actions/permissions/fork-pr-contributor-approval` → {"approval_policy":"first_time_contributors"}. Data impact: `git log -1 -- src/data/energy-prices.json` → 2026-06-01 16f79f3; PR #48 title says …

**Fix.** Two independent parts, both needed. (a) Unblock the check: set the approval policy so bot-authored same-repo PRs run without manual approval — `gh api -X PUT repos/duypham9895/evoyage/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_collaborators`. Verify by re-running deploy.yml on PR #49 and confirming the `Deploy to Vercel` context appears in statusCheckRollup. (b) Stop generating unmergeable PRs: the crawl workflows push a branch and open a PR that nothing ever merges. Either add an auto-merge step (`gh pr merge --auto --squash`) after `gh pr create` in crawl-energy-prices.yml:66-70 and crawl-stations.yml:100-104, or drop the PR dance and commit directly to main …

**Regression risk.** Relaxing the approval policy lets any collaborator-triggered pull_request run start automatically, which widens who can consume Actions minutes — low risk on a public repo with no secrets exposed to pull_request runs (deploy.yml:41 and :60 already gate the DIRECT_URL step away from dependabot). Enabling auto-merge on the automation PRs means station/energy data lands on main unreviewed; `Deploy to Vercel` (npm test + Playwright E2E) is the gate that would catch a malformed src/data/*.json, and …

**Verifier.** Reproduced independently at HEAD a00e34e; every refutation avenue closed. (1) NOT already fixed: gh pr list shows #49/#48 MERGEABLE+BLOCKED right now, and gh api .../branches/main/protection still returns required_status_checks.contexts=["Deploy to Vercel"]. statusCheckRollup on both PRs contains ONLY GitGuardian — no Deploy to Vercel entry. (2) The required context is correctly named, so it is not a config typo: deploy.yml:6-7 triggers on pull_request->main and deploy.yml:26 sets job name "Deploy to Vercel", matching the protection context exactly. The run simply never completes. (3) …

### `NEW-OPS-3` · Mapbox provider path has no fallback to OSRM — the resilience is one-directional

**Area:** ops-resilience · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/routing/osrm.ts:158-182 falls OSRM→Mapbox. The reverse does not exist: src/app/api/route/route.ts:210-247, the `provider === 'mapbox'` branch, calls `fetchDirectionsMapbox(...)` with no try/catch, and src/lib/routing/mapbox-directions.ts:56-58 throws `Mapbox Directions API error: ${response.status}` straight out to the handler's catch. Worse, route.ts:222-228: when `MAPBOX_ACCESS_TOKEN` is unset the branch returns `{ error: 'Mapbox access token not configured on server' }` with status 500 rather than falling through to the free OSRM path that is already wired up two branches below. src/app/plan/page.tsx:57 (`const activeMapMode = hasMapboxToken ? mode : 'osm'`) means users on Mapbox mode lose trip planning entirely during a Mapbox outage or token lapse.

**Fix.** Wrap the mapbox branch in the same shape as osrm.ts:158-182 — on a thrown error or a missing token, fall through to `fetchDirectionsFromCoords` (OSRM) and set `provider: 'osrm'` on the result so the UI can note the downgrade, as it already does for the reverse direction.

**Regression risk.** A silent provider swap changes polyline precision handling — the mapbox branch normalizes precision-6 to precision-5 at route.ts:236-238 while OSRM returns precision-5 directly, so a careless fallback would double-decode. src/lib/geo/polyline.ts tests and src/app/api/route/route.test.ts cover the precision paths.

**Verifier.** Independently reproduced every cited line at HEAD a00e34e; refutation attempts all failed. VERIFIED: (1) src/lib/routing/osrm.ts fallback block is real — shouldFallback guard at :159, `return { ...result, startCoord, endCoord, provider: 'mapbox' }` at :181, and the module header at :6-11 documents the OSRM→Mapbox policy. (2) src/app/api/route/route.ts mapbox branch (actual span :211-256, claim said 210-247 — minor offset) calls `await fetchDirectionsMapbox(...)` at :231 with no try/catch. (3) src/lib/routing/mapbox-directions.ts:56-58 throws `Mapbox Directions API error: ${response.status}` …

### `NEW-1` · Mapbox Matrix row includes the source→source cell, so every candidate station is scored with the previous station's drive time (station 0 gets 0 s)

**Area:** runtime-correctness · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/route/route.ts:487-495 maps `dp.candidates.map((station, j) => ... detourDriveTimeSec: matrix.durations[j] ?? 0)`. src/lib/routing/matrix-api.ts:42 builds the URL as `${sourceCoord};${destCoords}?sources=0` and matrix-api.ts:66-70 returns `data.durations[0]` whole. The project's own test documents the shape: src/lib/routing/matrix-api.test.ts:52-55 passes 2 destinations and asserts `result.durations` === `[0, 300, 600]` — length 3 = 1 source→source cell + 2 destinations. So index 0 is source→source (always 0) and candidate j reads candidate j-1's time. Executed against the real ranker (npx tsx, importing src/lib/routing/station-ranker.ts) with 3 candidates and Mapbox row [0, 2700, 120, 600]: BUGGY (durations[j]): best=FAR station 45 min away detour=0min score=48.3 ; ok=MID 10 min detour=2min ; slow=NEAR 2 min detour=45min score=93.3 FIXED (durations[j+1]): best=NEAR station …

**Fix.** Drop the source→source cell where it is produced, not at the call site: in src/lib/routing/matrix-api.ts:66-70 return `durations: data.durations[0].slice(1)` and `distances: data.distances[0].slice(1)` (guard for a missing row). Then update src/lib/routing/matrix-api.test.ts:52-55 to expect `[300, 600]` / `[5000, 10000]`, and add a route-level test that a candidate list of 3 maps 1:1 onto the 3 non-source durations.

**Regression risk.** Fixing it inside matrix-api.ts changes the documented return shape, so src/lib/routing/matrix-api.test.ts:47-56 ('parses response extracting row 0 from 2D arrays') fails until updated — that failure is the intended signal, not a regression. Nothing else reads MatrixResult (verified by grep over src). Ranking output changes for every non-corridor decision point, so any snapshot-style assertion on station order would move; src/app/api/route/route.test.ts has no matrix coverage so nothing there …

**Verifier.** Independently reproduced; could not refute. Verified at HEAD a00e34e: src/lib/routing/matrix-api.ts:42 builds the URL with `sources=0` and NO `destinations` param (so Mapbox defaults destinations=all), then lines 66-70 return `data.durations[0]` / `data.distances[0]` unsliced — a row of length N+1 whose cell 0 is the source-to-source pair (always 0). src/app/api/route/route.ts:487-495 then indexes it as `matrix.durations[j]` where j is the 0-based candidate index, so candidate 0 is scored with 0 s and candidate j is scored with candidate j-1's drive time. Line numbers cited are exact. The …

### `NEW-2` · /api/route never applies the vehicle's DC charging-power cap — VF 3 at a 120 kW station is quoted 6.4 min instead of 25.7 min

**Area:** runtime-correctness · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/route/route.ts:449-451 reads `('dcMaxChargingPowerKw' in vehicle && vehicle.dcMaxChargingPowerKw) ? ... : undefined`. But the `vehicle` local is assigned in exactly two places — route.ts:165-172 (DB vehicle) and route.ts:174-181 (custom vehicle) — and both copy only brand, model, variant, officialRangeKm, batteryCapacityKwh, chargingTimeDC_10to80_min. `grep -n 'vehicle\b' src/app/api/route/route.ts` confirms no other assignment. So the key is never present and `vehicleMaxChargeKw` is always `undefined`, making getEffectivePowerKw (station-ranker.ts:45-57) and the `input.vehicleMaxChargeKw` branch in scoreStation (station-ranker.ts:78-80) permanent no-ops. The data exists and the sibling endpoint uses it: prisma/schema.prisma:35 `dcMaxChargingPowerKw Float?`, src/lib/vietnam-models.ts:16 VF 3 = 30 kW, and src/app/api/stations/nearby/route.ts:93 selects it and :112 passes it …

**Fix.** Add `dcMaxChargingPowerKw: number | null` to the `vehicle` type declared at src/app/api/route/route.ts:144-151 and populate it in both assignments — `resolved.dcMaxChargingPowerKw` at :165-172 and `null` (or a new optional request field) at :174-181. Then simplify :449-451 to `vehicle.dcMaxChargingPowerKw ?? undefined` and delete the `in` check, which only ever hid the omission.

**Regression risk.** Charging-time estimates and station ranking both shift for every vehicle with a DC cap below the station's power, so any test asserting a specific estimatedChargeTimeMin or totalChargingTimeMin for a VinFast model changes. src/lib/routing/station-ranker.test.ts already exercises getEffectivePowerKw/scoreStation with an explicit vehicleMaxChargeKw and would catch a sign or min/max error in the cap itself. src/app/api/route/route.test.ts:205 ('returns byte-identical JSON when …

**Verifier.** Could not refute; every cited fact reproduces at HEAD a00e34e. (1) route.ts:144-151 types `vehicle` with exactly 6 fields, no dcMaxChargingPowerKw; the only two assignments (:165-172 DB/hardcoded, :174-181 custom) copy brand/model/variant/officialRangeKm/batteryCapacityKwh/chargingTimeDC_10to80_min and nothing else — grep for `vehicle =` returns only those two, with no later mutation or spread. (2) Reproduced at runtime: `'dcMaxChargingPowerKw' in vehicle` evaluates to false, so vehicleMaxChargeKw at route.ts:449-451 is permanently undefined, making getEffectivePowerKw at :473 and :496 and …

### `NEW-3` · Stations marked OUTOFSERVICE are offered as charging stops — the exclusion list covers only UNAVAILABLE and INACTIVE

**Area:** runtime-correctness · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/route/route.ts:80 `const EXCLUDED_STATION_STATUSES = ['UNAVAILABLE', 'INACTIVE'] as const;` — 'OUTOFSERVICE' is absent. That set drives both the Prisma filter (route.ts:336-339) and the in-memory re-filter (route.ts:364-367), so an OUTOFSERVICE row passes straight into `availableStations` and can be ranked as `best`. OUTOFSERVICE is a real, written value, not a theoretical one: prisma/schema.prisma:99 lists it as a chargingStatus value; src/lib/stations/parse-evpower.ts:86 maps Vietnamese 'bảo trì' / 'maintenance' → 'OUTOFSERVICE'; scripts/crawl-evpower-stations.ts:130 and :148 write `chargingStatus: station.chargingStatus` to the DB. Second, compounding path for VinFast rows: scripts/crawl-vinfast-stations.ts:268-276 builds `toProcess` by dropping every station whose charging_status === 'OUTOFSERVICE', and line 292 upserts only `toProcess`. A station already in the DB as …

**Fix.** Add 'OUTOFSERVICE' to EXCLUDED_STATION_STATUSES at src/app/api/route/route.ts:80. Separately, in scripts/crawl-vinfast-stations.ts:268-276, stop dropping OUTOFSERVICE stations from the upsert and instead upsert them with their real status so existing rows stop going stale (keep them out of the `station-stats.json` count at :327-331).

**Regression risk.** Widening the exclusion removes stations from routing, so a corridor whose only charger is OUTOFSERVICE now produces a NO_COMPATIBLE_STATION warning (route-planner.ts:382-393) instead of a stop — correct, but it changes the response for those routes. src/app/api/route/route.test.ts is the guard for the overall response contract. The crawler change is riskier: it makes previously-skipped stations appear in ChargingStation, so scripts/crawl-vinfast-stations.ts's created/updated counts and …

**Verifier.** Independently reproduced at HEAD a00e34e; every cited line checks out and no refutation route held. (1) src/app/api/route/route.ts:80 literally reads `const EXCLUDED_STATION_STATUSES = ['UNAVAILABLE', 'INACTIVE'] as const;` — OUTOFSERVICE absent. It is the only status gate: Prisma notIn at :337-338, in-memory re-filter at :364-366, then availableStations feeds planInput.stations (:380) and scoreStation/rankStations (:464-508) with no further status check. A grep of `chargingStatus` across src/ shows no other filter in the trip-planning path. (2) The value is real production data, not …

## P2 — 25 open

### `AGENT-1` · All 9 project subagents in .claude/agents/ are inert — no YAML frontmatter, so Claude Code never registers them

**Area:** agent-infra · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** Ran `for f in *.md; do printf "%-28s line1=[%s]\n" "$f" "$(sed -n '1p' "$f")"; done` in /Users/edwardpham/Documents/Programming/Projects/evoyage/.claude/agents/. Real output — every file's line 1 is an H1, not `---`: content-writer.md line1=[# Content Writer Agent] devsecops.md line1=[# Head of DevSecOps Agent] head-of-design.md line1=[# Head of Product Design Agent] head-of-engineering.md line1=[# Head of Engineering Agent] head-of-product.md line1=[# Head of Product Agent] qa-lead.md line1=[# QA Lead Agent] senior-backend.md line1=[# Senior Backend Engineer Agent] senior-frontend.md line1=[# Senior Frontend Engineer Agent] ux-researcher.md line1=[# UX Researcher Agent] A follow-up loop testing `[ "$(sed -n '1p' "$f")" = "---" ]` printed no FRONTMATTER lines, and grepping lines 1-10 of all 9 files for `^(name|description):` returned zero matches. CORROBORATION that frontmatter is the …

**Fix.** Prepend a YAML frontmatter block to each of the 9 files: `---`, `name: <kebab-case matching the filename>`, `description: <one line stating when to invoke, written as a trigger so auto-delegation fires>`, `tools: <minimal set>`, `---`. Keep the existing H1 and body below it. Derive each `description` from the file's own '## When to Invoke' section (e.g. .claude/agents/qa-lead.md:6-11) rather than inventing new triggers. Verify registration by running `/agents` and confirming all 9 appear; a file that still fails to load has a YAML parse error, not a missing key.

**Regression risk.** No runtime code is touched, so `npm test` (1467 tests) and `npx next build` are unaffected and cannot catch a mistake here — there is no test covering agent registration. The real risk is a `name:` colliding with one of the 24 global ~/.claude/agents/gsd-*.md agents or a built-in name, which would shadow the global agent project-wide; the 9 proposed names (content-writer, devsecops, head-of-design, head-of-engineering, head-of-product, qa-lead, senior-backend, senior-frontend, ux-researcher) …

**Verifier.** Could not refute; independently reproduced and strengthened. (1) Evidence verified beyond the original check: grepping the ENTIRE body of all 9 files in .claude/agents/ for `^---$|^name:|^description:|^tools:` returns ZERO matches, so frontmatter is absent everywhere, not merely at line 1. (2) The registration gate is confirmed at source level, not from memory: the installed CLI binary (~/.local/share/claude/versions/2.1.285) contains the agent loader `let{name:h,description:b}=r; if(!h||typeof h!=="string")return null;` plus the diagnostic string "Files with no `name` in frontmatter are co- …

### `C28` · 3 of 5 named API routes now tested; stations + vehicles + 3 cron wrappers still untested

**Area:** code-quality-tests · **Effort:** M · **Status:** PARTIAL

**Evidence.** `find src/app/api -type f | sort` — colocated route.test.ts NOW EXISTS for: src/app/api/route/route.ts (217-line test), src/app/api/feedback/route.ts (164-line test), src/app/api/short-url/route.ts (132-line test). STILL MISSING for: src/app/api/stations/route.ts (91 lines, no test), src/app/api/vehicles/route.ts (173 lines, no test), src/app/api/cron/aggregate-popularity/route.ts (42), src/app/api/cron/aggregate-reliability/route.ts (33), src/app/api/cron/poll-station-status/route.ts (35). Also uncovered but not named in C28: src/app/api/evi/suggestions/route.ts (67), src/app/api/share-card/route.tsx (135), src/app/api/stations/[id]/vinfast-detail/route.ts (212). MITIGATION MEASURED: the 3 cron routes are thin auth-then-delegate wrappers and their business logic IS tested — `find src/lib -name 'aggregate-*' -o -name 'poll-status*' -o -path '*maintenance*'` returns aggregate- …

**Fix.** Scope down to the two that actually carry untested logic: (1) src/app/api/stations/route.ts — cover bbox validation at lines 57-62 (lat/lng out of range → 400), 65-70 (box >5°×5° → 400), the provider allowlist at line 30-32, and the 429 path at 19-25. (2) src/app/api/vehicles/route.ts — cover the 429 path (lines 20-28), the `id` lookup DB hit and its `catch { /* fall through */ }` fallback to VIETNAM_MODELS (lines 33-58), and the filter params. Skip writing wrapper tests for the 3 cron routes; instead add the cron-auth test in NEW-1, which is the only untested code they contain.

**Regression risk.** Adding tests cannot break runtime behavior. The risk is the opposite — writing them will likely expose the silent-fallback in NEW-2 and force a behavior decision. If the new stations test asserts a 400 for malformed bounds, it will fail against current code; that is a finding, not a regression. e2e/stations.spec.ts is the existing guard that the GET /api/stations happy path still works after any refactor prompted by the new tests.

**Verifier.** Could not refute; every element independently reproduced at HEAD a00e34e. (1) File inventory matches exactly: route.test.ts exists for route/ (217 lines), feedback/ (164), short-url/ (132); absent for stations/route.ts (91), vehicles/route.ts (173), and the 3 cron routes (42/33/35). (2) Original C28 at EVOYAGE_AUDIT_PLAN.md:305 names exactly those 5 routes + 3 cron routes, so "3 of 5" and PARTIAL are correct. (3) All cited line numbers verified correct in-file: stations bbox checks at 57-62 and 65-70, ALLOWED_PROVIDERS at 30-32, 429 at 19-25; vehicles id-lookup try/catch at 36-58 ending in …

### `NEW-1` · src/lib/cron-auth.ts — the shared cron auth gate has zero tests

**Area:** code-quality-tests · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `find src/lib -name 'cron-auth*'` returns exactly one file: src/lib/cron-auth.ts. No cron-auth.test.ts. All three cron routes gate on it and nothing else — aggregate-popularity/route.ts:27, aggregate-reliability/route.ts:22, poll-station-status/route.ts:24 each call `verifyCronSecret(request)` and return 401 on false. The function (cron-auth.ts:8-27) does a fixed-512-byte timingSafeEqual plus a trailing length check: `return timingSafeEqual(bufA, bufB) && expected.length === provided.length;` (line 26), with an early `return false` when CRON_SECRET is unset (lines 12-15). Note cron-auth.ts:21-24 copies into `Buffer.alloc(512)` — a CRON_SECRET long enough to make `Bearer ${secret}` exceed 512 bytes would be silently truncated before comparison. Untested either way.

**Fix.** Add src/lib/cron-auth.test.ts covering: missing CRON_SECRET → false; absent Authorization header → false; wrong secret → false; correct `Bearer <secret>` → true; a provided header that shares the first 512 bytes but differs in length → false (pins the line-26 length check); and a >512-byte secret so the truncation behavior at lines 21-24 is documented rather than latent. This is a single small file and closes the only genuinely untested code path behind all three cron endpoints.

**Regression risk.** Pure test addition, no production change, so nothing can break. If the >512-byte case is fixed rather than just documented, the new cron-auth.test.ts cases are themselves the guard; additionally src/lib/station/poll-status.test.ts and aggregate-*.test.ts would still cover the downstream jobs unchanged, since they never touch auth.

**Verifier.** Could not refute; every element reproduces exactly at HEAD a00e34e. (1) NOT already fixed: exhaustive find over all *.test.ts/*.test.tsx/*.spec.ts in the repo (excluding node_modules/.next/.worktrees) grepped for "cron" returns ZERO files; src/lib/cron-auth.test.ts does not exist; last commit touching cron-auth.ts is 5190f6b (2026-03-18) with no test. (2) Line numbers are exact, not stale: cron-auth.ts function 8-27, early return false 12-15, Buffer.alloc(512) 21-24, and line 26 is verbatim `return timingSafeEqual(bufA, bufB) && expected.length === provided.length;`; routes gate at …

### `NEW-LINT-0` · eslint and tsc never run in CI; PRs get no lint, no type check, no build

**Area:** code-quality-tests · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `grep -rn -iE 'eslint|npm run lint|npm test|vitest|tsc' .github/workflows/` returns exactly ONE line across all 9 workflow files: `.github/workflows/deploy.yml:64: run: npm test`. There is no eslint step and no `tsc --noEmit` step anywhere. deploy.yml is the only workflow triggered by `pull_request` (lines 3-5), and its Build step is gated `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` — so a PR runs npm ci, the Prisma drift check, `npm test`, and Playwright, then stops. `next build` (the project's only type check, since there is no tsc step) never runs on a PR. Next is 16.2.6 (`node -p "require('./node_modules/next/package.json').version"`), where build-time ESLint was removed, and next.config.ts contains no `eslint`/`typescript` block at all (`grep -nE 'eslint|typescript|ignoreDuringBuilds|ignoreBuildErrors' next.config.ts` → NONE), so even the main-branch build …

**Fix.** Add two steps to the existing deploy.yml job, after `npm ci` and before `Run unit tests` (around line 63), so they run on pull_request as well: `- name: Lint` / `run: npx eslint src scripts --max-warnings=0` and `- name: Type check` / `run: npx tsc --noEmit`. Land them only AFTER NEW-LINT-1..4 are fixed, otherwise the first PR goes red on 14 pre-existing errors. If the 18 warnings cannot be cleared in the same pass, start with plain `npx eslint src scripts` (errors only) and tighten to --max-warnings=0 in a follow-up.

**Regression risk.** This gates merges rather than changing app behavior, so no runtime feature can break — the failure mode is a red CI on unrelated PRs, which is the point. The concrete hazard is Dependabot: PRs #75 #73 #67 #64 are open now, and a lint or type step added while the 14 errors persist will block all four. Verify by running `npx eslint src scripts --max-warnings=0; echo $?` and `npx tsc --noEmit; echo $?` locally and requiring both to exit 0 before committing the workflow change.

**Verifier.** CORE CLAIM CONFIRMED against live code at HEAD a00e34e; I could not refute it. Reproduced: the cited grep returns exactly one line (.github/workflows/deploy.yml:64 `run: npm test`); no eslint and no `tsc --noEmit` step exists in any of the 9 workflows; deploy.yml lines 3-7 make it the only `pull_request`-triggered workflow (the other 8 are schedule/workflow_dispatch/tag-push, e.g. release.yml is `push: tags: v*.*.*`); the Build step at lines 109-111 is gated `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`; next.config.ts (read in full, 35 lines) has no …

### `NEW-LINT-3` · react-hooks/set-state-in-effect — 2 errors, cascading renders in useIsMobile and useRouteNarrative

**Area:** code-quality-tests · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** Two occurrences. (1) src/hooks/useIsMobile.ts:12:5 — read the full 20-line file: `useState(false)` at line 8, then `useEffect` at 10 immediately calls `setIsMobile(mql.matches)` at line 12 before subscribing at 15. Every mobile visitor therefore renders once as desktop, then re-renders. (2) src/hooks/useRouteNarrative.ts:162:7 — read lines 150-175: inside the effect, `if (!tripPlan) { lastTripIdRef.current = null; setState(INITIAL_STATE); return; }`. eslint's message on both: 'Calling setState synchronously within an effect body causes cascading renders'.

**Fix.** useIsMobile.ts is the one that matters — replace the useState+useEffect pair with `useSyncExternalStore(subscribe, () => mql.matches, () => false)`, which gives the correct value on the first client render while keeping the `false` server snapshot that SSR needs. useRouteNarrative.ts:162 is a legitimate reset-on-input-change and is better handled by deriving from `tripPlan` or keying the consumer, but if that is too invasive, leave it and add a scoped eslint-disable with a comment — do not silence useIsMobile the same way.

**Regression risk.** useIsMobile drives the mobile/desktop layout split, so getting the server snapshot wrong turns this into a hydration mismatch — the exact class of bug C32 already tracks for MapLocateButton. It has NO colocated test; its consumers are covered by src/components/feedback/FeedbackFAB.test.tsx, src/components/map/MapboxMap.test.tsx and src/components/trip/TripSummary.test.tsx, and end-to-end by e2e/bottom-sheet.spec.ts and e2e/desktop-tabs.spec.ts — run both e2e specs, not just the unit tests. …

**Verifier.** Independently reproduced at HEAD; refutation failed on every axis. eslint JSON output confirms both hits at the EXACT cited locations: src/hooks/useIsMobile.ts:12:5 and src/hooks/useRouteNarrative.ts:162:7, rule react-hooks/set-state-in-effect, severity 2. Direct file reads confirm the code shape: useIsMobile.ts is 20 lines with useState(false) at L8, useEffect at L10, setIsMobile(mql.matches) at L12, mql.addEventListener at L15; useRouteNarrative.ts L160-163 is the `if (!tripPlan) { lastTripIdRef.current = null; setState(INITIAL_STATE); return; }` reset block. NOT STALE: full-repo `eslint …

### `NEW-LINT-4` · react-hooks/refs — ref read during render in MobileBottomSheet

**Area:** code-quality-tests · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** One occurrence: src/components/layout/MobileBottomSheet.tsx:56:7. Read lines 49-62 — `const currentHeight = isDragging ? startHeightRef.current - dragOffset : getHeightPx(snap);` at lines 55-57, in the component body. `startHeightRef.current` is written inside the touch handler at line 62 (`startHeightRef.current = getHeightPx(snap)`). eslint's message: 'Cannot access refs during render — accessing a ref value during render can cause your component not to update as expected'.

**Fix.** Move the drag origin into state so the render is driven by a tracked value: capture `startHeight` with `useState` in handleTouchStart alongside `setIsDragging(true)`, and compute `currentHeight` from that instead of from the ref. The ref is only read on the `isDragging` branch, and `setIsDragging` already re-renders on the same event, so the state write costs nothing extra.

**Regression risk.** This is live drag math for the mobile bottom sheet — a wrong conversion makes the sheet jump or stick mid-drag, and there is no unit test for this component (`grep -rln 'MobileBottomSheet' --include='*.test.tsx' src` returns nothing). e2e/bottom-sheet.spec.ts is the only guard; run it, and if it only asserts snap points rather than drag continuity, verify the drag by hand before merging.

**Verifier.** Independently reproduced at HEAD a00e34e. `npx eslint src/components/layout/MobileBottomSheet.tsx --format json` returns exactly one message: react-hooks/refs, severity 2 (error), at line 56 column 7 — matching the claimed location character-for-character. Repo-wide it is the only react-hooks/refs occurrence. The code at lines 55-57 confirms the ref read in the component body: `const currentHeight = isDragging ? startHeightRef.current - dragOffset : getHeightPx(snap);`. All five refutation paths were tried and failed: (1) NOT already fixed — reproduced live at HEAD with the Cloudflare WIP …

### `NEW-SEC-1` · Admin Basic Auth is bypassed by any request path containing a dot

**Area:** code-security · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/middleware.ts:129-131 is a single catch-all matcher whose negative lookahead ends in `.*\..*` — i.e. ANY pathname containing a dot is excluded from middleware entirely, so checkAdminAuth (middleware.ts:49-73, called at :111-114) never runs for those paths. Confirmed live against production, not inferred: curl -X PATCH -d 'not-json' https://evoyage.duypham.me/api/admin/feedback/aaa -> HTTP 401, body "Authentication required" curl -X PATCH -d 'not-json' https://evoyage.duypham.me/api/admin/feedback/a.a -> HTTP 400, body {"error":"invalid_json"} curl https://evoyage.duypham.me/admin/feedback/a.a -> HTTP 404, 12679 bytes, and the body contains the string "eVoyage Admin" (the admin layout shell from src/app/admin/layout.tsx:19) — rendered with no credentials. The 400/404 responses prove the handler and the admin page tree execute unauthenticated. There is no second line of defense: …

**Fix.** Stop relying on the matcher for authorization. Two changes, both small: (1) in src/middleware.ts, compute `isAdmin` from the raw pathname and run checkAdminAuth before anything else — but the matcher must also admit those paths, so add explicit entries `'/admin/:path*'` and `'/api/admin/:path*'` alongside the existing catch-all rather than replacing it. (2) Add a server-side auth assertion inside src/app/api/admin/feedback/[id]/route.ts (and any future admin route) so the gate is not single-point. Then correct the two comments that assert the opposite of the current behavior (src/middleware.ts:127-128 and src/app/api/admin/feedback/[id]/route.ts:5-6).

**Regression risk.** The matcher does double duty: it also gates the CSP nonce. If the catch-all entry is edited or reordered while adding admin entries, some routes stop receiving the nonce, and under `strict-dynamic` (middleware.ts:91) every Next.js chunk is then blocked — the whole site goes non-interactive. That exact failure already happened once (src/app/layout.tsx:52-58 records the 2026-05-24 smoke test where /plan was static and its chunks were blocked). e2e/csp-smoke.spec.ts is the existing test that …

**Verifier.** CONFIRMED and independently reproduced; severity corrected P1 -> P2. CODE PROOF: src/middleware.ts:129-131 is a single catch-all matcher whose negative lookahead ends in `.*\..*`. Evaluated the actual regex in node: `/admin/feedback` and `/api/admin/feedback/abc` match (middleware runs), while `/admin/feedback/a.a`, `/admin/feedback/x.json` and `/api/admin/export.csv` are all excluded. checkAdminAuth (middleware.ts:49-73, invoked at :111-114) therefore never runs for any dotted path. LIVE PROOF (my own GET requests to production, 2026-09-30; I deliberately did NOT send the PATCH): - GET …

### `NEW-SEC-2` · vinfast-detail SSE route rate limit falls back to per-instance in-memory store in production

**Area:** code-security · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/stations/[id]/vinfast-detail/route.ts:37 calls `await checkRateLimit(`vinfast-detail:${ip}`, 20, 60_000)` with NO fourth argument. src/lib/rate-limit.ts:94 takes the Redis path only `if (limiter)`; with the argument omitted it falls through to :104 `checkLocalRateLimit`, which is backed by the module-level `const localStore = new Map(...)` at rate-limit.ts:19. That store is documented at rate-limit.ts:18 as the "In-memory fallback for local development without Redis" and at rate-limit.ts:1-4 the module states the Redis path is what "Works across Vercel serverless function instances." So on Vercel this route's limit is per-lambda-instance and resets on every cold start — effectively no cap for a distributed or cold-start-inducing caller. This is the most expensive route in the tree: vercel.json:6-8 gives it a 512MB memory override, route.ts:7 sets maxDuration 25, and it …

**Fix.** Add a dedicated limiter in src/lib/rate-limit.ts next to the others — `export const vinfastDetailLimiter = hasRedis ? createRedisRatelimiter(20, 60) : null;` — and pass it as the fourth argument at src/app/api/stations/[id]/vinfast-detail/route.ts:37. One-line change on each side; keep the existing 20/60s numbers so behavior is unchanged for legitimate traffic.

**Regression risk.** Low but real: the route currently never 429s across instances, so turning on a distributed limit could start rejecting the app's own burst pattern if the station-detail UI opens several SSE streams per user action. Verify the client's request pattern in src/lib/vinfast/ before merging. There is no colocated test — `ls "src/app/api/stations/[id]/vinfast-detail/"` shows route.ts only — so the regression guard has to be the e2e station flow (e2e/stations.spec.ts); add a colocated route.test.ts …

**Verifier.** Independently reproduced at HEAD a00e34e; every cited line number is exact and all refutation angles failed. VERIFIED: src/app/api/stations/[id]/vinfast-detail/route.ts:37 calls `await checkRateLimit(`vinfast-detail:${ip}`, 20, 60_000)` with no fourth argument. src/lib/rate-limit.ts:94 gates the Redis path on `if (limiter)`; omitting it falls to :104 `checkLocalRateLimit`, backed by the module-level `localStore = new Map(...)` at :19, documented at :18 as the local-dev fallback while :1-4 states the Redis path is what "Works across Vercel serverless function instances." So on Vercel this …

### `C20` · Server and client Mapbox tokens are the SAME token in .env.local and .env.prod

**Area:** data-layer · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** Measured without printing secret values, by SHA-256 of each value: in /Users/edwardpham/Documents/Programming/Projects/evoyage/.env.local, MAPBOX_ACCESS_TOKEN and NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN both hash to 4df46ef2d3b5, len=96, prefix `pk.`; in .env.prod the same two keys also both hash to 4df46ef2d3b5, len=96 — IDENTICAL? true in both files. This directly violates the instruction in the repo's own .env.example:25-28 ('MUST be a separate, public token scoped to your web domain referrer ... Do NOT reuse MAPBOX_ACCESS_TOKEN here'). The two are used on opposite sides of the trust boundary: client bundle at src/components/map/MapboxMap.tsx:511 (`process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`) vs server-only at src/app/api/route/route.ts:224, :371, :576, src/lib/routing/osrm.ts:161, :206, :264 and src/app/api/share-card/route.tsx:73. No repo leak: `git ls-files | grep -i env` returns only …

**Fix.** Mint a second Mapbox public token restricted to the evoyage.duypham.me URL, set it as NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in Vercel (all three environments) and in .env.local/.env.prod, and leave the existing unrestricted token as server-only MAPBOX_ACCESS_TOKEN. Do not add URL restrictions to the current shared token: server-side Directions/Matrix calls send no Referer and would start returning 403. Caveat I cannot close from this machine: production truth is the Vercel dashboard, not .env.prod — confirm with `vercel env pull` or the dashboard before declaring it fixed (note .env.vercel exists but contains neither key).

**Regression risk.** Swapping the client token breaks basemap rendering if the new token's URL restriction omits localhost or the Vercel preview domains — MapboxMap.tsx:511 falls back to `''` and the map silently fails to init. The guard at src/app/plan/page.tsx:56 (`hasMapboxToken`) only checks presence, not validity, so no unit test catches a bad token; e2e covers it only via the CI dummy at .github/workflows/deploy.yml:89 (`'pk.dummy_token_for_ci_build'`), which means E2E green does NOT prove the real token …

**Verifier.** Independently reproduced at HEAD a00e34e and every refutation path failed. Measured by SHA-256 without printing values: after stripping surrounding quotes, ALL SIX Mapbox values across .env, .env.local and .env.prod (both MAPBOX_ACCESS_TOKEN and NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in each) are the identical token — sha256[0:12]=ff8a2591fb23, len=94, prefix `pk.`. The claim's reported 4df46ef2d3b5/len=96 was the quoted form; unquoting strengthens rather than weakens it, revealing .env shares the same token too. (1) Not already fixed. (2) Line numbers all correct: MapboxMap.tsx:511 sits in a file …

### `NEW-1` · Disaster-recovery and cron runbooks still tell operators to run the deleted `npm run db:push`

**Area:** data-layer · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `node -e "const p=require('.../package.json'); console.log('db:push =', p.scripts['db:push'])"` → `db:push = undefined`. The script was removed by the C17 fix (package.json:21 now has only `db:push:local`), but six call sites were not updated: /Users/edwardpham/Documents/Programming/Projects/evoyage/docs/RECOVERY.md:25 ('run `npm run db:push` to reconcile schema') and :146 ('always edit the schema file and run `npm run db:push`'); docs/operations/cron-setup.md:24 and :32; README.md:58; and .github/workflows/deploy.yml:55 ('Run \'npx prisma db push\' against Supabase before pushing schema changes'). docs/RECOVERY.md:39 already uses the correct `FORCE_DB_PUSH_TO_PROD=1 npm run db:push:local`, so the file contradicts itself.

**Fix.** Replace `npm run db:push` with `npm run db:push:local` at docs/RECOVERY.md:25 and :146, docs/operations/cron-setup.md:24 and :32, and README.md:58 — and at RECOVERY.md:25 (a production-corruption path) prefix it with `FORCE_DB_PUSH_TO_PROD=1` to match the working step at :39. Change deploy.yml:55's message from `npx prisma db push` to `FORCE_DB_PUSH_TO_PROD=1 npm run db:push:local`, since as written it instructs the operator to route around the guard that C17 was created to install.

**Regression risk.** Docs-and-echo-string only; no runtime code path changes, so `npm test` (1467 tests) and `npx next build` are unaffected and cannot regress. The one thing to get right is NOT dropping FORCE_DB_PUSH_TO_PROD from the RECOVERY.md:25 line — without it, scripts/db-push-local.ts:17-23 exits 1 against a pooler URL and the runbook fails at exactly the moment it is needed. There is no test over any of these files, so verification is reading them back.

**Verifier.** Independently reproduced at HEAD a00e34e. `npm run db:push` → `npm error Missing script: "db:push"`; package.json:21 has only `db:push:local`. All five cited `npm run db:push` call sites exist verbatim at the exact line numbers given: docs/RECOVERY.md:25 and :146, docs/operations/cron-setup.md:24 and :32, README.md:58. The self-contradiction is real — RECOVERY.md:39 already uses the correct `FORCE_DB_PUSH_TO_PROD=1 npm run db:push:local` while :25 and :146 in the same file still name the deleted script. Root cause confirmed in git: commit 8057f2f (the C17 fix) renamed the script and touched …

### `NEW-1` · AGENTS.md is a corrupted "Claude"→"Codex" find-replace of CLAUDE.md — false attribution + non-existent paths

**Area:** doc-drift · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `cmp CLAUDE.md AGENTS.md` → "differ: char 1839, line 29" (md5 b78a9dc… vs 0857555…). `/usr/bin/diff -u CLAUDE.md AGENTS.md` shows 5 hunks, every one a blind Claude→Codex substitution. AGENTS.md:29 "eVoyage is built entirely by Codex (Anthropic's AI coding agent)" vs CLAUDE.md:29 "…by Claude Code…" and README.md:7 "**Built entirely by Claude Code.**". AGENTS.md:88 points at `.Codex/skills/karpathy-guidelines/SKILL.md`; `ls -d .Codex` → "No such file or directory", while `.claude/skills/karpathy-guidelines/SKILL.md` exists (2.5K). AGENTS.md:58 invents skill ids `everything-Codex:tdd`; AGENTS.md:72 invents `Codex-md-management:*`. AGENTS.md:40 "MiniMax M2.7 AI for eVi trip assistant" vs CLAUDE.md:40 "OpenAI gpt-5 (primary) + MiniMax M2.7 (fallback)". `git log --oneline -5 -- AGENTS.md` → single commit a8cd818 "fix(evi): restore GPT parse responses" — an unrelated message, i.e. the file …

**Fix.** Delete AGENTS.md and the `.agents/` tree, or regenerate AGENTS.md from CLAUDE.md verbatim with only the filename references changed — never the word "Claude". Do not hand-patch the 5 hunks; the whole file is machine-mangled and `.agents/skills/**` has the same defect. If AGENTS.md must exist for non-Claude agents, make it a one-line pointer: `See ./CLAUDE.md`. Highest priority in this dimension because CLAUDE.md names transparency-about-authorship as a core project value, and AGENTS.md asserts the opposite to any agent that reads it.

**Regression risk.** Deleting AGENTS.md could strip context from a non-Claude agent that only reads AGENTS.md — mitigate with the one-line pointer instead of deletion. No test covers root markdown files (`grep -rln README src --include="*.test.ts"` returns only src/lib/station-stats.test.ts), so nothing in `npm test` will catch a bad edit here; verification is `cmp`/`diff` against CLAUDE.md plus `ls` on every path the file cites.

**Verifier.** Independently reproduced at HEAD a00e34e; every refutation avenue failed. md5 CLAUDE.md=b78a9dc157085ad4251316b490da348f vs AGENTS.md=0857555135a12ad7ba79705f84f5142f; cmp -> "differ: char 1839, line 29", exactly as claimed. All five cited line numbers are exact: AGENTS.md:29 "built entirely by Codex (Anthropic's AI coding agent)" against CLAUDE.md:29 "Claude Code" and README.md:7 "**Built entirely by Claude Code.**"; AGENTS.md:88 points at .Codex/skills/karpathy-guidelines/SKILL.md while `ls -d .Codex` returns "No such file or directory" and .claude/skills/karpathy-guidelines/SKILL.md …

### `B1` · Feedback image upload ships end-to-end, but EXIF is never stripped before publishing to a public blob

**Area:** missing-features · **Effort:** M · **Status:** PARTIAL

**Evidence.** The path IS built and is ALREADY_FIXED relative to the audit's "zero UI references" claim: uploader src/components/feedback/FeedbackImageUpload.tsx mounted at src/components/feedback/FeedbackModal.tsx:440; API src/app/api/feedback/upload/route.ts (139 lines, rate-limited 5/hr at :74, magic-byte sniffing at :43-63, 5MB cap at :98); persisted at src/app/api/feedback/route.ts:123 into prisma/schema.prisma:250. BUT two D.3 acceptance criteria are unmet. (a) EXIF: `grep -rni "exif|sharp|strip.*metadata" src/ package.json` returns one unrelated comment hit in route/route.ts:562 and nothing else — src/app/api/feedback/upload/route.ts:118 calls `put(filename, buf, {access: 'public', ...})` with the raw uploaded ArrayBuffer, so GPS coordinates and device serials in a reporter's phone photo are published verbatim at a public URL. (b) Email thumbnail: `grep -n "image|Image" …

**Fix.** Strip EXIF server-side in src/app/api/feedback/upload/route.ts between the sniff at :107 and the `put` at :118. `sharp` is the lightest option already common in the Next.js ecosystem: `await sharp(buf).rotate().toBuffer()` drops all metadata by default while honoring orientation. For HEIC, sharp needs libheif — if that is not available on the Vercel runtime, either drop image/heic from ALLOWED_TYPES (:24-29) or transcode to JPEG. Separately, reconsider `access: 'public'` at :119 given these are user-submitted photos attached to feedback. The email thumbnail is cosmetic and can be deferred.

**Regression risk.** Adding sharp risks a native-binding failure on the Vercel Node runtime, which would turn every upload into the 502 at :132-137 — the modal degrades gracefully but uploads stop. src/app/api/feedback/upload/route.test.ts is the existing guard; it must be extended with a fixture carrying real EXIF and an assertion that the bytes handed to `put` no longer contain the APP1 marker, otherwise the fix is unverifiable. Dropping HEIC would regress iPhone reporters — check …

**Verifier.** Core claim reproduced exactly; refutation attempts all failed. VERIFIED: src/app/api/feedback/upload/route.ts is 139 lines and every cited line is exact (rate limit :74, sniff helper :43-63 called at :107, 5MB cap :98, ALLOWED_TYPES :24-29). Lines 118-124 do `put(filename, buf, {access:'public', contentType: sniffedType, addRandomSuffix:false})` where `buf` is the raw `await file.arrayBuffer()` from :106 — nothing touches the bytes between sniff and publish. `grep -rniE "exif|sharp|strip.*metadata|piexif|image-meta" src/ scripts/ package.json docs/` returns exactly one hit, the unrelated …

### `B5` · ADR-0004 TripPlanner Module still not shipped; the route handler it was meant to shrink grew to 758 lines

**Area:** missing-features · **Effort:** L · **Status:** STILL_OPEN

**Evidence.** `awk 'END{print NR}' src/app/api/route/route.ts` → 758 lines. ADR-0004 promised shrinking it from 573 to ~50-80; docs/adr/0004-status.md (dated 2026-05-24) measured 646. It has grown a further 112 lines since that status doc and is now 185 lines larger than when the ADR was written. `grep -rn "planTrip(" src/` returns zero hits — no `planTrip(input): Result` entry point exists. src/lib/routing/route-planner.ts is 420 lines and still exports only `planChargingStops` / `findChargingDecisionPoints` (imported that way at src/app/api/route/route.ts:13). The handler still wires the pipeline directly: prisma, getCachedRoute/setCachedRoute (route.ts:20), calculateUsableRange (route.ts:16), applyBackupPressure (route.ts:14), planChargingStops (route.ts:13).

**Fix.** Preconditions from docs/adr/0004-status.md still hold and are now more urgent. First write a colocated test for the wire contract — note src/app/api/route/route.test.ts NOW EXISTS (it mocks trackReliabilityCalibration at line 66), so verify its coverage before assuming precondition 1 is unmet. Then extract in slices rather than one refactor: move the vehicle lookup + range calc first, then the Mapbox/OSRM fetch + cache, then station ranking, keeping the handler's response shape byte-identical at each step.

**Regression risk.** This is the highest-risk change in the codebase — the handler owns trip planning end to end, and a silent change to the response shape breaks the whole /plan page. Guards: src/app/api/route/route.test.ts, and the Playwright trip-planning E2E spec. Before starting, confirm the existing route.test.ts actually asserts the response body shape; if it only asserts status codes, that gap must be closed first or the refactor has no net.

**Verifier.** Every cited measurement reproduces exactly at HEAD a00e34e. `awk 'END{print NR}' src/app/api/route/route.ts` = 758. `grep -rn "planTrip(" src/` returns zero function hits (only the 'planTrip' UI tab-id string in plan/page.tsx, DesktopTabBar.tsx, useDesktopSidebarTab.ts). route-planner.ts is 420 lines and exports exactly two functions, `findChargingDecisionPoints` (:95) and `planChargingStops` (:259) — no `planTrip`, no typed Result, no VehicleNotFoundError/MapboxUnavailableError/TripPlannerAbortedError. The handler still wires the pipeline directly at the exact cited lines: route.ts:4 …

### `NEW-1` · ADR-0007 reliability telemetry is a silent no-op: browser-only PostHog called from a server route handler

**Area:** missing-features · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/route/route.ts:18 imports `trackReliabilityCalibration` from '@/lib/analytics' and calls it at src/app/api/route/route.ts:439 inside the POST handler. src/lib/analytics.ts:16 is `import posthog from 'posthog-js'` (browser SDK). The capture guard is src/lib/analytics.ts:61 `if (!initialized) return;`. `initialized` is set true ONLY inside `initAnalytics()` (src/lib/analytics.ts:52), and `grep -rn "initAnalytics" src/ | grep -v analytics.ts` returns exactly one production caller: src/components/AnalyticsProvider.tsx:27, inside a file whose line 1 is `'use client'`. `grep -rn "posthog-node" src/ scripts/` returns zero hits; package.json declares only posthog-js. route.ts:1-21 imports `crypto` and `@/lib/prisma`, so it is unambiguously the Node server runtime, where `initialized` is never set. Every trackReliabilityCalibration call returns at line 61 without capturing.

**Fix.** Add a server-side capture path. Either install `posthog-node` and instantiate a module-level `PostHog` client in a new `src/lib/analytics-server.ts` (flushed via `await client.shutdown()` or `flushAt: 1` on serverless), or POST directly to `${NEXT_PUBLIC_POSTHOG_HOST}/capture/` with the project key from a server-only env var. Then repoint route.ts:439 at that module. Keep the same event name and property keys (`candidate_count`, `gated_count`, `mean_reliability`) so no PostHog dashboard rework is needed. Audit for the same bug class before shipping: any other @/lib/analytics import from a file under src/app/api/ is equally dead.

**Regression risk.** Introducing a server PostHog client adds an outbound network call inside the hot /api/route path; if not fire-and-forget it could add latency or fail the request. Guard with the existing swallow-errors pattern (analytics.ts:64-66). src/app/api/route/route.test.ts:66 already mocks `trackReliabilityCalibration`, so a signature or import-path change is caught by that existing suite; keep the exported function name stable or update that mock in the same commit.

**Verifier.** Independently reproduced at HEAD a00e34e; every cited line is exact. src/app/api/route/route.ts:18 imports trackReliabilityCalibration from '@/lib/analytics' and calls it at route.ts:439 inside the POST handler. src/lib/analytics.ts:16 is `import posthog from 'posthog-js'` (browser SDK); the capture guard at analytics.ts:61 is `if (!initialized) return;` and the ONLY assignment of `initialized = true` is analytics.ts:52 inside initAnalytics(). grep -rn "initAnalytics" src/ excluding analytics.ts/tests returns exactly one production caller: src/components/AnalyticsProvider.tsx:27, in a file …

### `NEW-OPS-1` · Trip-plan API has no maxDuration; client parses JSON before checking response.ok, so any gateway error surfaces as a raw SyntaxError to the user

**Area:** ops-resilience · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `grep -c maxDuration src/app/api/route/route.ts` → `0 matches`. Every other heavy handler declares one (evi/parse:12 =60, narrative:8 =70, transcribe:8 =15, vinfast-detail:7 =25, feedback/upload:21 =30). /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/plan/page.tsx:556-559 reads `const data = await response.json();` BEFORE `if (!response.ok) { throw new Error(data.error ?? ...) }`, and line 622 does `setError(err instanceof Error ? err.message : 'An unknown error occurred')`. The handler chains Nominatim (2x10s, osrm.ts:79) + OSRM (10s, osrm.ts:106) + optional Mapbox fallback (10s) + Matrix API + several Prisma queries with no overall budget; client abort is 25s (plan/page.tsx:167 TRIP_CALC_ABORT_MS = 25_000), so Vercel's platform default kills the function first and returns a non-JSON body.

**Fix.** Add `export const maxDuration` to src/app/api/route/route.ts sized to the real worst case (and lower the per-call AbortSignal.timeout values so the sum fits). In src/app/plan/page.tsx, move the `response.ok` check before `response.json()` and wrap the parse: `if (!response.ok) { const msg = await response.json().catch(() => null); throw new Error(msg?.error ?? t('errors.routeFailed')); }`.

**Regression risk.** Reordering the ok-check changes which message reaches setError on 4xx paths. src/app/api/route/route.test.ts covers the 400/404/422/502/504 response shapes; the client-side reorder has no direct test — the Playwright spec for trip planning (e2e trip-planning) would catch a broken happy path but not a changed error string.

**Verifier.** Both defects reproduce exactly at HEAD a00e34e; severity corrected P0 -> P2. VERIFIED (could not refute): 1. /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/route/route.ts contains no `maxDuration`. Read the file end-to-end and ran `git log -S "maxDuration" -- src/app/api/route/route.ts`, which returns NOTHING — the export was never present. This is an omission, not a stale audit item, and nothing was fixed in the interim. 2. All five comparison handlers confirmed at the exact cited lines: evi/parse:12=60, narrative:8=70, transcribe:8=15, vinfast-detail:7=25, …

### `NEW-OPS-12` · Server-side Nominatim calls in /api/evi/parse have no timeout and can burn the whole 60s function budget

**Area:** ops-resilience · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/evi/parse/route.ts:136-140 — `const reverseRes = await fetch(reverseUrl, { headers: { 'User-Agent': ... } });` with no `signal`. src/lib/geo/nominatim.ts:32-37 accepts an optional `signal` but the two server-side call sites (evi/parse/route.ts:102 and :149) pass none. The route declares `maxDuration = 60` (line 12). The surrounding try/catch (route.ts:142, :156) catches a thrown error but cannot interrupt a hang, so a slow Nominatim consumes the entire budget after the LLM has already spent up to 12s (minimax-client.ts:46 `timeoutMs: 12_000`). A per-file audit of fetch call sites confirms the same gap in src/lib/vinfast/vinfast-browser.ts, src/lib/speech/whisper-engine.ts, src/lib/station/vinfast-browser-client.ts and src/lib/feedback/email.ts, while osrm.ts, matrix-api.ts, overpass-client.ts, mapbox-*.ts and vinfast- …

**Fix.** Add `signal: AbortSignal.timeout(5000)` to the reverse-geocode fetch at evi/parse/route.ts:138, and pass an AbortSignal from the two server-side `searchPlaces` calls — the parameter already exists at nominatim.ts:19.

**Regression risk.** A 5s cap will drop the display-name enrichment on slow Nominatim responses; both call sites already degrade gracefully (route.ts:142 and :156 comment "continue without address/coordinates"). src/app/api/evi/parse/route.test.ts covers the parse response shape and would catch a thrown-instead-of-caught abort.

**Verifier.** Tried to refute; could not. Every cited line reproduces against HEAD a00e34e. VERIFIED IN CODE (not from the stale audit doc): - /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/evi/parse/route.ts:12 — `export const maxDuration = 60;` (another route comments this is the Vercel Hobby ceiling, so 60s really is the whole budget). - route.ts:137-139 — `const reverseRes = await fetch(reverseUrl, { headers: { 'User-Agent': ... } });` with no `signal`. (Evidence said 136-140 / fix said 138; the fetch actually starts at 137 — trivial offset, not a wrong-line refutation.) - …

### `NEW-OPS-4` · vinfast-detail — the app's most expensive public endpoint — has a non-distributed rate limit in production

**Area:** ops-resilience · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/stations/[id]/vinfast-detail/route.ts:37 is `const limit = await checkRateLimit(`vinfast-detail:${ip}`, 20, 60_000);` — the 4th parameter (`limiter`) is omitted. src/lib/rate-limit.ts:87-105: when `limiter` is falsy the function falls to `checkLocalRateLimit`, which reads and writes the module-level `const localStore = new Map(...)` at line 19. On Vercel that Map is per-instance and dies with the instance, so the effective limit scales with the number of concurrent lambdas. src/lib/rate-limit.ts:66-79 pre-builds eight Redis limiters (routeLimiter, stationsLimiter, vehiclesLimiter, shareCardLimiter, eviLimiter, transcribeLimiter, feedbackUploadLimiter, routeMultiWaypointLimiter) — there is none for vinfast-detail. This endpoint has `maxDuration = 25` (line 7), gets a dedicated 512 MB allocation in vercel.json, and …

**Fix.** Add `export const vinfastDetailLimiter = hasRedis ? createRedisRatelimiter(20, 60) : null;` to src/lib/rate-limit.ts alongside the others and pass it as the 4th argument at vinfast-detail/route.ts:37.

**Regression risk.** Turning on a real distributed limit will start returning 429 to traffic that previously got through — the SSE client must already handle the `code: 'RATE_LIMITED'` event emitted at route.ts:40. No existing test covers that endpoint (there is no vinfast-detail/route.test.ts); the station-detail E2E spec would catch a hard break but not a tightened limit.

**Verifier.** REFUTATION FAILED — every cited fact reproduces verbatim at HEAD a00e34e. Evidence verified independently: 1. `/Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/stations/[id]/vinfast-detail/route.ts:37` is exactly `const limit = await checkRateLimit(\`vinfast-detail:${ip}\`, 20, 60_000);` — 4th arg omitted. Line number exact, file has not moved. 2. `src/lib/rate-limit.ts:87-105`: `checkRateLimit(identifier, maxRequests, windowMs, limiter?)` uses the Redis limiter only `if (limiter)`; otherwise it falls through to `checkLocalRateLimit`, which reads/writes the module-level …

### `NEW-OPS-5` · aggregate-popularity returns ok:true when the cache prune fails, so the only CI failure gate never trips and RouteCache/VinFastStationDetail growth silently resumes

**Area:** ops-resilience · **Effort:** S · **Status:** PARTIAL

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/station/aggregate-popularity.ts:65-82 — a prune failure is pushed into `errors` at :72-74 but the function still returns `{ ok: true, ... }` at :77-82. src/lib/maintenance/prune-stale-caches.ts:60 computes `ok: errors.length === 0` correctly, but src/app/api/cron/aggregate-popularity/route.ts:35-41 spreads `...popularity` and then cherry-picks only `caches.routeCachePruned`, `caches.vinfastDetailPruned`, `caches.errors` — `caches.ok` is discarded. .github/workflows/aggregate-popularity.yml:32-35 is the only failure detector: `if echo "$response" | grep -q '"ok":false'; then ... exit 1; fi`. So both prunes can fail every night for months with a green workflow. These are exactly the two tables the audit's C12/C16 prune was built to bound (see the docstring at prune-stale-caches.ts:1-15).

**Fix.** Make aggregate-popularity.ts:77 return `ok: errors.length === 0`, and have the route surface the combined health, e.g. `ok: popularity.ok && caches.ok`, rather than letting the spread decide. Optionally also fail the workflow on a non-empty `cacheErrors`.

**Regression risk.** Flipping ok to false on a prune failure will start turning the nightly workflow red for conditions that are currently tolerated, including a transient DB timeout on the DELETE. src/lib/station/aggregate-popularity.test.ts and src/lib/maintenance/prune-stale-caches.test.ts assert the current return shapes and will need updating together.

**Verifier.** The core operational gap reproduces exactly and is genuinely open, but the finding's diagnosis and half its proposed fix are wrong, and the severity is inflated. VERIFIED (survives refutation): src/app/api/cron/aggregate-popularity/route.ts:35-41 spreads `...popularity` and cherry-picks only caches.routeCachePruned / vinfastDetailPruned / errors — `caches.ok` is discarded. The response body therefore contains exactly one `ok` key, the popularity one. .github/workflows/aggregate-popularity.yml:32-35 is the only assertion (`grep -q '"ok":false'`); `curl --fail-with-body` only catches non-2xx, …

### `NEW-OPS-6` · Feedback submission blocks on an untimed Resend fetch after the row is already written — a Resend hang shows the user a failure for a saved submission

**Area:** ops-resilience · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/feedback/route.ts:107 creates the Feedback row, then line 134 `await sendFeedbackEmail({...})` before the 201 is returned at :154. `grep -c maxDuration src/app/api/feedback/route.ts` → `0 matches`, so the platform default applies. src/lib/feedback/email.ts:200-215 issues `await fetch('https://api.resend.com/emails', { method: 'POST', headers, body })` with NO `signal` / AbortSignal.timeout — the try/catch at :177/:225 catches thrown errors but cannot interrupt a hang. Result: the DB write succeeds, the function is killed by the platform, the browser gets a non-JSON gateway body, and the user retries — producing duplicate Feedback rows. The comment at route.ts:131 ("must await — Vercel kills the function after response") shows the await is deliberate; the missing timeout is the defect.

**Fix.** Add `signal: AbortSignal.timeout(5000)` to the Resend fetch in email.ts:200. The existing catch at :225 already logs and swallows, and `emailSent` stays false, so the daily-cap counter at :162-169 remains correct.

**Regression risk.** A 5s cap could abort a genuinely slow-but-successful send, leaving emailSent=false while the email actually went out (duplicate notification on any future retry). src/app/api/feedback/route.test.ts covers the 201 path; there is no test for the email timeout, so add one asserting the 201 still returns when the fetch aborts.

**Verifier.** Reproduced independently; refutation failed on every axis. VERIFIED: (1) email.ts:200-214 is `await fetch('https://api.resend.com/emails', {method, headers, body})` with NO `signal` — grepped the options block directly, zero matches. (2) route.ts:107 creates the Feedback row, :134 awaits sendFeedbackEmail, 201 returns at :155 (claim said :154 — cosmetic off-by-one; the comment is at :132 not :131, same). (3) `grep -c maxDuration src/app/api/feedback/route.ts` = 0 and vercel.json sets only `memory` for vinfast-detail, so the platform default applies — while 8 sibling routes DO set maxDuration …

### `NEW-OPS-7` · StationReliability and StationPopularity are upsert-only, never pruned, and no consumer checks freshness — the ranker silently uses frozen scores if aggregation stops

**Area:** ops-resilience · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** `grep -rnE 'DELETE FROM|deleteMany|\.delete\(' src/ scripts/ prisma/` over non-test files returns deletes only for StationStatusObservation (aggregate-popularity.ts:68), RouteCache (prune-stale-caches.ts:38), VinFastStationDetail (prune-stale-caches.ts:50) and VinfastApiCookies (refresh-vinfast-cookies.ts:126, poll-vinfast-station-status.ts:114). Nothing ever deletes from StationReliability or StationPopularity. Both aggregations are `INSERT ... ON CONFLICT DO UPDATE` over a rolling window (aggregate-reliability.ts:32-51 uses `observedAt > NOW() - INTERVAL '30 days'`; aggregate-popularity.ts:34-53 uses 60 days), so a station that drops out of the window keeps its last score forever. On the read side, src/lib/routing/reliability-score.ts:16-22 takes only `{reliability, observationCount}` and never looks at `computedAt`; src/lib/station/popularity-query.ts:74-85 gates only on …

**Fix.** Gate both consumers on age: in reliability-score.ts return 1.0 when `Date.now() - computedAt > N days` (plumb computedAt through the map built at route.ts:414-421), and in popularity-query.ts return `{ kind: 'insufficient-data' }` for a stale `updatedAt`. Separately, have each aggregation delete rows for stationIds that produced no rows in the current window.

**Regression risk.** Adding a staleness gate will flip stations from penalized back to neutral, changing ranking output. src/lib/routing/reliability-score.test.ts, src/lib/routing/station-ranker.test.ts and src/lib/station/popularity-query tests pin the current multipliers and will need the new axis added rather than replaced.

**Verifier.** Tried to refute; the core survives. Every cited line reproduces at HEAD a00e34e. The delete grep over non-test code returns exactly the five sites named (aggregate-popularity.ts:68 StationStatusObservation, prune-stale-caches.ts:38/:50, refresh-vinfast-cookies.ts:126, poll-vinfast-station-status.ts:114) and nothing that deletes from StationReliability or StationPopularity. aggregate-reliability.ts:32-51 is INSERT...ON CONFLICT DO UPDATE over `observedAt > NOW() - INTERVAL '30 days'`; aggregate-popularity.ts:34-53 is the same shape over 60 days. reliability-score.ts:16-22 takes only …

### `NEW-OPS-8` · ShortUrl, StationStatusReport and Feedback grow without bound — the C12 problem class beyond RouteCache

**Area:** ops-resilience · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** The repo-wide delete grep (see NEW-OPS-7 evidence) shows src/lib/maintenance/prune-stale-caches.ts prunes exactly two tables: RouteCache (:38) and VinFastStationDetail (:50). Three other write-heavy tables have retention-shaped indexes but no pruner. (1) ShortUrl — prisma/schema.prisma:209-218 with `@@index([createdAt])`; src/lib/short-url.ts:66 sets a 1-year `expiresAt` and :99-107 filters it on READ only, and its own comment at :14-15 says rows "remain valid until manually pruned". POST /api/short-url allows 10/min + 50/hr per IP (short-url/route.ts:38,49), so rows accrue permanently. (2) StationStatusReport — prisma/schema.prisma:121-131 with `@@index([createdAt])`, written by the public POST /api/stations/[id]/status-report, never deleted. (3) Feedback — prisma/schema.prisma:231-265, never deleted, and its `imageUrl` blobs (written via /api/feedback/upload, 5/hr/IP) have no …

**Fix.** Extend src/lib/maintenance/prune-stale-caches.ts with the same `$executeRaw` DELETE pattern for ShortUrl (`expiresAt < NOW()`, plus a floor for the NULL legacy rows) and StationStatusReport (`createdAt < NOW() - INTERVAL '90 days'` — the crowdsourced signal is already denormalized onto ChargingStation.lastVerifiedAt). Feedback is a record store, not a cache — leave the rows, but add blob cleanup for images attached to CLOSED/RESOLVED feedback.

**Regression risk.** Deleting ShortUrl rows breaks any already-shared link whose code is pruned — the resolver at short-url.ts:99 returns null and the /s/[code] page 404s. Pruning StationStatusReport changes nothing at read time only if lastVerifiedAt is truly denormalized; verify that before deleting. src/lib/short-url.test.ts covers create/resolve/expiry.

**Verifier.** Independently reproduced at HEAD a00e34e; refutation attempts all failed. (1) /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/maintenance/prune-stale-caches.ts deletes from exactly two tables, RouteCache (:38) and VinFastStationDetail (:50) — exact line numbers. A repo-wide grep for deleteMany|.delete(|DELETE FROM over src/scripts/prisma (tests excluded) returns only those two plus StationStatusObservation (aggregate-popularity.ts:68) and VinfastApiCookies (two scripts). Nothing in .github/workflows/, no prisma/migrations/, no pg_cron, no SQL cleanup file. (2) ShortUrl at …

### `NEW-OPS-9` · crawl-vinfast-stations bulk upsert can abort a whole batch on a primary-key collision, leaving the station table partially updated with no transaction boundary

**Area:** ops-resilience · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/scripts/crawl-vinfast-stations.ts:173-174 resolves the row id as `existingByOcmId.get(data.ocmId) ?? existingByEntityId.get(s.entity_id)`, then line 182 uses it as the INSERT's `id`. The conflict target at line 215 is only `ON CONFLICT ("ocmId") DO UPDATE`. prisma/schema.prisma:72 declares `id String @id` and :73 `ocmId String? @unique`, while entityId at :94 is only indexed (:117 `@@index([entityId])`) — NOT unique. So when an incoming station's ocmId is absent from the DB but its entity_id belongs to a row carrying a different ocmId, the statement inserts an existing PK with a new ocmId: ON CONFLICT(ocmId) does not fire and Postgres raises a unique violation on ChargingStation_pkey, aborting the entire multi-row batch. The same shape breaks if two incoming stations in one batch resolve to the same existing id ('ON CONFLICT DO …

**Fix.** Make the conflict target match how the id is chosen — either look up existing rows by ocmId only, or add `ON CONFLICT ("id")` handling / a unique constraint on entityId. De-duplicate the batch by resolved id before building `values`. Wrapping the whole crawl in a transaction is not advisable at this row count; instead make the run resumable and only write station-stats.json after a fully successful pass.

**Regression risk.** Adding a unique constraint on entityId will fail the migration if duplicates already exist in production. Changing the id-resolution rule can orphan a station's history (StationStatusObservation.stationId is a bare string with no FK — prisma/schema.prisma:148-155). scripts/ has no test coverage; scripts/verify-counts.ts is the only post-run check.

**Verifier.** Reproduced independently at HEAD. scripts/crawl-vinfast-stations.ts:177-178 resolves `existingId = existingByOcmId.get(data.ocmId) ?? existingByEntityId.get(s.entity_id)`, line 186 uses it as the INSERT's `id`, and line 213 sets the arbiter to `ON CONFLICT ("ocmId")` only. prisma/schema.prisma confirms `id String @id` (:73), `ocmId String? @unique` (:74), `entityId String?` (:94) with only `@@index([entityId])` (:117) — not unique. So when an incoming station's ocmId is absent from the DB but its entity_id belongs to a row with a different ocmId, the arbiter does not fire and Postgres raises …

### `NEW-4` · The station-popularity heatmap can never produce a verdict: the UTC cron only ever lands on odd Vietnam hours, and no cell can reach the 20-sample threshold

**Area:** runtime-correctness · **Effort:** L · **Status:** STILL_OPEN

**Evidence.** Two independent, compounding defects. (a) Hour parity. .github/workflows/poll-station-status.yml:21 runs `cron: '5 */2 * * *'` — GitHub Actions cron is UTC — so observations land at UTC hours 0,2,…,22. src/lib/station/aggregate-popularity.ts:42 buckets by `EXTRACT(HOUR FROM "observedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')`, i.e. UTC+7. Computed in-session: VN hours observed: 1,3,5,7,9,11,13,15,17,19,21,23 VN hours with ZERO observations, forever: 0,2,4,6,8,10,12,14,16,18,20,22 → 84 of the 168 cells can never fill. (b) Threshold unreachable. src/lib/station/popularity-query.ts:19 sets POPULARITY_SAMPLE_THRESHOLD = 20 and :84 returns `{kind:'insufficient-data'}` below it. aggregate-popularity.ts:47 windows on `NOW() - INTERVAL '60 days'` and :48 groups by (stationId, dayOfWeek, hour). A fixed (dow, hour) pair recurs floor(60/7)=8 to 9 times in 60 days, so sampleCount ≤ 9 < 20 even if every …

**Fix.** Three changes, all needed: (1) make the poll cadence coprime with 24 or shift it — e.g. `cron: '5 */1 * * *'`, or `'5 1-23/2 * * *'` plus `'5 0-22/2 * * *'` on alternating days — so all 24 VN hours get covered; (2) stop relying on transition rows for a frequency statistic — either record every poll (and prune harder) or store a per-(station,dow,hour) hit/sample counter that the poller increments regardless of change; (3) only then re-derive POPULARITY_SAMPLE_THRESHOLD from the real achievable sample count instead of 20.

**Regression risk.** Recording every poll instead of only changes multiplies StationStatusObservation row volume by ~12×; the 90-day prune at aggregate-popularity.ts:67-70 and the full-table `SELECT DISTINCT ON` at poll-status.ts:135-141 both need an index check before that lands. src/lib/station/poll-status.test.ts asserts the dedup-on-change behaviour directly and will fail — that failure is the point, but it must be rewritten deliberately, not deleted. src/lib/station/popularity-query.test.ts pins the 20-sample …

**Verifier.** Independently reproduced all three sub-claims at HEAD a00e34e; every cited line number matched exactly. (a) poll-station-status.yml:21 is `cron: '5 */2 * * *'` (GHA cron is UTC → UTC hours 0,2,…,22); observedAt is @default(now()) at insert (prisma/schema.prisma:152) and aggregate-popularity.ts:42 buckets via `AT TIME ZONE 'Asia/Ho_Chi_Minh'`, so VN hour = (even+7) mod 24 = always odd → 12 VN hours × 7 days = 84 of 168 cells structurally unreachable. (b) popularity-query.ts:19 threshold 20, :84 returns insufficient-data below it; aggregate-popularity.ts:47-48 windows 60 days grouping by …

### `NEW-5` · ADR-0007's reliability penalty is a permanent no-op — a station broken for 30 days straight scores as if it were perfect

**Area:** runtime-correctness · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** src/lib/routing/reliability-score.ts:14 sets RELIABILITY_THRESHOLD = 100 and :20 returns 1.0 (no penalty) whenever `observationCount < 100`. src/lib/station/aggregate-reliability.ts:42 computes `observationCount` as `COUNT(*)` of StationStatusObservation rows in the 30-day window at :45. But that table stores transitions, not samples: src/lib/station/poll-status.ts:146-148 inserts only rows whose status differs from the previous observation. And the poll fires every 2 h (.github/workflows/poll-station-status.yml:21), so the absolute ceiling is 12×30 = 360 rows, reachable only if a station flips status on literally every poll. Failing input, executed in-session against the real function: a station reported OUTOFSERVICE on every poll for 30 days writes exactly ONE transition row, so the aggregate is {reliability: 0.00, observationCount: 1}. reliabilityMultiplier({reliability:0.00, …

**Fix.** Same root cause as NEW-4 — the count-based gate is measuring transitions. Either have aggregate-reliability.ts count polls rather than changes (requires the poller to record every poll, or to maintain a per-station poll counter), or replace the raw-count gate at reliability-score.ts:20 with a gate on observation *span* (e.g. at least N distinct days covered) so a station observed broken across 30 days is not treated as unmeasured.

**Regression risk.** Turning the multiplier on for the first time re-orders stations at every decision point, so trip plans change broadly — this is the first time ADR-0007 has had any effect in production. src/lib/routing/reliability-score.test.ts and src/lib/routing/station-ranker.test.ts cover the multiplier curve and will catch an inverted or out-of-range multiplier; src/lib/station/aggregate-reliability.test.ts covers the SQL shape. Ship it behind the existing calibration telemetry at …

**Verifier.** Independently reproduced at HEAD a00e34e. All five cited locations are exact: reliability-score.ts:14 (RELIABILITY_THRESHOLD = 100), :20 (returns 1.0 below threshold); aggregate-reliability.ts:42 (COUNT(*) as observationCount) and :45 (30-day window); poll-status.ts:146-148 (filters to rows whose status differs from the latest observation, i.e. transitions only); .github/workflows/poll-station-status.yml:21 (cron '5 */2 * * *'); station-ranker.ts:100 (score *= reliabilityMultiplier). Executed the real function via npx tsx: {reliability:0, observationCount:1} -> 1, {0,99} -> 1, {0,100} -> 2, …

### `NEW-6` · tripId omits waypoints and departAt, so the cached AI narrative from a different route is shown for the new one

**Area:** runtime-correctness · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/route/route.ts:541-546 hashes only `{start, end, vehicleId, customVehicle sig, currentBatteryPercent, minArrivalPercent, rangeSafetyFactor, provider}` into tripId. Both `waypoints` (accepted at route.ts:54-58, used at :258-259 and :234) and `departAt` (accepted at :53, used at :301 and :578-587 where it can replace the whole duration via Mapbox traffic) are excluded. The client sends both: src/app/plan/page.tsx:546 `...(departAt ? { departAt } : {})` and :547-553 `waypoints: waypoints.filter(...).map(...)`. The narrative cache keys on tripId alone: src/hooks/useRouteNarrative.ts:29 reads `localStorage.getItem('narrative:' + tripId)`, and :67-77 returns that cached text and `return`s before ever calling /api/route/narrative. The effect at :168-170 also short-circuits on an unchanged tripId. Failing input: plan Hà Nội → TP Hồ Chí Minh (VF 8, 90% → 10%, factor 0.8, OSRM) and …

**Fix.** Include both in the hash at src/app/api/route/route.ts:541-545 — add `departAt: departAt ?? null` and `waypoints: waypoints.map(w => [w.lat.toFixed(4), w.lng.toFixed(4)])` (coordinates only, so a renamed waypoint does not bust the cache). Keep the key stable across reorderings only if the planner treats waypoint order as insignificant, which it does not (osrm.ts:242-249 builds the coordinate string in array order), so preserve order.

**Regression risk.** tripId is also the identity used for precautionary-stop dismissals in the notebook (src/app/plan/page.tsx:142-148 and :185-191) and as a React effect key in src/components/trip/TripSummary.tsx:507 and :720. Changing the hash invalidates every stored narrative under the old `narrative:<id>` localStorage keys (harmless — they regenerate) but also orphans any persisted dismissed-stop pairs keyed on the old id, so previously dismissed precautionary stops reappear once. …

**Verifier.** Independently reproduced at HEAD a00e34e; every cited line is accurate and the bug is live. src/app/api/route/route.ts:541-546 hashes only {start, end, vehicleId, customVehicle sig, currentBatteryPercent, minArrivalPercent, rangeSafetyFactor, provider} into tripId. Both excluded fields are real accepted inputs that change the plan: waypoints (schema :54-58) rebuilds the polyline at :234 (Mapbox) and :258-259 (fetchDirectionsWithWaypoints) and bypasses the route cache at :209; departAt (schema :53) can replace totalDurationMin entirely at :578-587 via fetchTrafficAwareDirections, and …

## P3 — 30 open

### `AGENT-3` · .claude/docs/agents.md documents 3 'Layer 0' reviewer agents and 4 global agents that exist nowhere on disk

**Area:** agent-infra · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/.claude/docs/agents.md:28-33 declares a '### Technical Reviewers (from Layer 0)' table listing **map-reviewer**, **i18n-checker** and **ux-auditor**. Ran `grep -rn "map-reviewer\|i18n-checker\|ux-auditor" --include="*.md" --include="*.json" --include="*.ts" --include="*.yml" .` — every hit in the main tree is inside agents.md itself (lines 31, 32, 33, 40, 41, 42, 43, 47, 48, 66, 83, 91, 92, 97); the only other hits are the same file duplicated in .worktrees/dependabot-integration/. No agent file defines any of the three. `ls -la .claude/agents/` shows exactly 9 files, none of them map-reviewer/i18n-checker/ux-auditor. `ls -la ~/.claude/agents/` shows 24 files, all prefixed gsd-, none of them these three. These three are not decorative — they carry real workflow weight. agents.md:66 ('8. ux-auditor + i18n-checker → Review …

**Fix.** Decide per name, then make agents.md match disk. For map-reviewer / i18n-checker / ux-auditor: either author the three missing agent files in .claude/agents/ with proper frontmatter (ux-auditor is the one worth writing — it is the only enforcement point for the 'Less Icons' rules in CLAUDE.md; i18n-checker is largely redundant because src/lib/__tests__/locale-keys.test.ts already catches key mismatches automatically), or delete the '### Technical Reviewers (from Layer 0)' table at lines 28-33 and strip those names from the workflows at lines 40-48, 66, 83, 91-92 and 97. For the global names at lines 104-107, rewrite them to the real installed names (code-reviewer → gsd-code-reviewer, …

**Regression risk.** Markdown only; no source file changes, so `npm test` and `npx next build` are unaffected and no test covers this. The one substantive risk is deleting rather than authoring ux-auditor: agents.md:83 and :92 are the only places the 'Less Icons, More Humanity' rules in CLAUDE.md are assigned to a reviewer, so removing the name without a replacement silently drops the only enforcement hook for that design policy. Nothing automated would catch that — no test asserts icon usage.

**Verifier.** Core claim reproduced exactly; I tried to break it and could not. Verified at HEAD a00e34e: 1) Line numbers are exact. `/Users/edwardpham/Documents/Programming/Projects/evoyage/.claude/docs/agents.md:28-33` is "### Technical Reviewers (from Layer 0)" listing **map-reviewer**, **i18n-checker**, **ux-auditor**, and lines 40-48, 66, 83, 91-92, 97 do wire them into the routing table and the New Feature / Design Change / Pre-Deployment workflows. Lines 104-107 are the "Combining with Global Agents" list naming `code-reviewer`, `planner`, `debugger`, `architect`. 2) The three reviewers exist …

### `AGENT-4` · Agent routing table and agent bodies point at ~9 module paths that no longer exist — src/lib was reorganized into subdirectories

**Area:** agent-infra · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** Existence-checked every path in the '## Agent-to-File Routing' table at .claude/docs/agents.md:38-53: MISSING src/lib/osrm.ts (agents.md:43) MISSING src/lib/route-planner.ts (agents.md:44) MISSING src/lib/station-ranker.ts (agents.md:44) MISSING src/lib/station-finder.ts (agents.md:44) MISSING src/lib/mapbox-* (agents.md:43; `ls src/lib/mapbox-*` → 'no matches found') MISSING src/lib/google-* (agents.md:43; `ls src/lib/google-*` → 'no matches found') MISSING src/lib/vinfast-*.ts (agents.md:45; `ls src/lib/vinfast-*` → 'no matches found') OK src/lib/locale.tsx, prisma/schema.prisma, next.config.ts, src/app/globals.css, src/locales/*.json The modules were moved, not deleted. `git ls-files | grep -E "osrm|route-planner|station-ranker|station-finder|mapbox|google-|vinfast"` returns their real homes: src/lib/routing/osrm.ts, src/lib/routing/route-planner.ts, src/lib/routing/station- …

**Fix.** Rewrite the path column of .claude/docs/agents.md:40-53 against the current tree: `src/lib/routing/*` → map-reviewer/senior-backend, `src/lib/station/*` and `src/lib/vinfast/*` → senior-backend/devsecops, `src/lib/trip/*` → senior-backend. In the agent bodies, repoint .claude/agents/senior-backend.md:43-47 to src/lib/routing/osrm.ts, src/lib/routing/mapbox-directions.ts, src/lib/trip/google-maps-url.ts and src/lib/station/vinfast-*.ts, and confirm whether a Nominatim module still exists before keeping line 46. Replace the `src/components/__tests__/` guidance at qa-lead.md:20, qa-lead.md:57 and senior-frontend.md:26 with the colocated `.test.tsx` convention CLAUDE.md actually specifies. …

**Regression risk.** Markdown only — no source file is touched, so `npm test` (1467 tests) and `npx next build` stay green and neither can catch an error here; there is no test asserting that documented paths resolve. The live risk is doing this while the uncommitted Cloudflare-challenge WIP is open in src/lib/station/vinfast-browser-client.ts and src/lib/station/vinfast-upstream-error.ts: repointing the vinfast row must not be taken as license to edit those files. Confine the change to .claude/docs/agents.md and …

**Verifier.** Tried to refute; could not. Every cited path and line number reproduced independently at HEAD a00e34e. VERIFIED AS CLAIMED (all reproduced): - /Users/edwardpham/Documents/Programming/Projects/evoyage/.claude/docs/agents.md:43-45 contains verbatim `src/lib/osrm.ts`, `src/lib/mapbox-*`, `src/lib/google-*` (:43); `src/lib/route-planner.ts`, `station-ranker.ts`, `station-finder.ts` (:44); `src/lib/vinfast-*.ts` (:45). All MISSING on disk; the three globs return zsh "no matches found". - Real homes confirmed via `git ls-files`: src/lib/routing/{osrm,route-planner,station-ranker,station- …

### `AGENT-5` · Skills are healthy — 13 of 14 valid; only .claude/skills/review/ lacks a SKILL.md and cannot register

**Area:** agent-infra · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `find .claude/skills -maxdepth 2 -name "SKILL.md"` returned 13 files, and every one has `line1=[---]`: caveman, diagnose, grill-me, grill-with-docs, improve-codebase-architecture, karpathy-guidelines, setup-matt-pocock-skills, tdd, to-issues, to-prd, triage, write-a-skill, zoom-out. Ran `for f in .claude/skills/*/SKILL.md; do n=$(sed -n '1,12p' "$f" | grep -cE '^name:'); d=$(sed -n '1,12p' "$f" | grep -cE '^description:'); ...` — all 13 report `name=1 desc=1`. Every skill is correctly registerable. This is the direct contrast with AGENT-1: same repo, same author, skills got frontmatter and agents did not. The one gap: `for d in .claude/skills/*/; do [ -f "$d/SKILL.md" ] || echo "MISSING SKILL.md: $d"; done` → `MISSING SKILL.md: .claude/skills/review/`. `ls -la .claude/skills/review/` shows a single file, `checklist.md 2.4K`, whose line 1-3 read '# eVoyage — Pre-Landing Review …

**Fix.** Either add a SKILL.md to .claude/skills/review/ with frontmatter (`name: review`, a description triggering on pre-landing/pre-deploy review) that points at the existing checklist.md as a bundled resource, or, if the checklist is genuinely superseded by the installed `code-review` and qodo review skills, move checklist.md to docs/ and delete the skills/review/ directory so it stops looking like a broken skill. Check first whether the 'global gstack review checklist' it claims to extend still exists — .gstack/ is gitignored and the base checklist may be gone, which would make the file unusable as written.

**Regression risk.** Nothing currently references .claude/skills/review/, so neither adding a SKILL.md nor removing the directory can break an existing flow; `npm test` and `npx next build` are untouched and no test covers skill registration. The only risk is the reverse of a regression — registering it adds a new auto-triggering skill that could fire alongside the installed `code-review` and qodo review skills on the same request, so scope its description narrowly to pre-landing review if you keep it.

**Verifier.** Independently reproduced every cited fact at HEAD a00e34e; refutation attempts all failed. VERIFIED: (1) `find .claude/skills -maxdepth 2 -name SKILL.md` returns exactly 13 files matching the claimed list; the frontmatter loop returns `line1=[---] name=1 desc=1` for all 13 — skills genuinely are healthy. (2) `.claude/skills/` has 14 directories vs 13 SKILL.md; the gap is `review/`, which contains exactly one file, `checklist.md` (2480 bytes), whose lines 1-3 match the quoted text verbatim. (3) Orphan status confirmed and STRENGTHENED: I widened the grep beyond `*.md` to all file types …

### `C11` · Stale comments still cite a private-repo 2000 min/month Actions budget; repo is public

**Area:** ci-actions · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** .github/workflows/poll-station-status.yml:6-8 — "combined GHA budget on a private repo at ~2000 min/month doesn't fit". .github/workflows/refresh-vinfast-cookies.yml:10-12 — "exceeds the GHA private-repo 2000 min/month budget when combined with poll-station-status.yml + crawl-stations.yml. Cost: ~360 runs/month × ~2 min = ~720 min/month". `gh api repos/duypham9895/evoyage --jq '.private, .visibility'` → `false`, `public` — Actions are unmetered, so the stated constraint does not exist.

**Fix.** Rewrite both comment blocks to drop the budget rationale. Do NOT act on the audit's follow-on suggestion to move cookie refresh to hourly: the original justification for hourly was to reduce downstream cookies_expired poll failures, and that failure mode is already gone (refresh-vinfast-cookies: 100/100 success over the last 100 runs; poll-station-status: 99/100). Hourly would double runner load for no measured benefit. State the real current rationale instead — 2h refresh matches the ~2h CF clearance cookie lifetime noted at refresh-vinfast-cookies.yml:5-6.

**Regression risk.** Comment-only change; no runtime behavior. The one way to turn this into a regression is to also apply the audit's hourly-cadence suggestion, which would alter the cron at refresh-vinfast-cookies.yml:13 and the deliberate 5-minute offset at poll-station-status.yml:21 that staggers the two jobs. Keep the cron lines untouched.

**Verifier.** Independently reproduced; refutation failed on every axis. (1) Both cited comments are present verbatim at HEAD a00e34e: poll-station-status.yml:6-10 says "the combined GHA budget on a private repo at ~2000 min/month doesn't fit"; refresh-vinfast-cookies.yml:10-12 says "exceeds the GHA private-repo 2000 min/month budget ... Cost: ~360 runs/month x ~2 min = ~720 min/month". Line numbers are accurate (the finding cites the budget sentences inside slightly larger blocks spanning 6-10 and 5-12 respectively; immaterial). (2) `gh api repos/duypham9895/evoyage` returns private=false, …

### `C9` · delete_branch_on_merge is still false

**Area:** ci-actions · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `gh api repos/duypham9895/evoyage --jq '.delete_branch_on_merge'` → `false`. Same command the audit cited; the setting has not changed.

**Fix.** `gh api -X PATCH repos/duypham9895/evoyage -F delete_branch_on_merge=true`. One caveat the audit did not note: crawl-stations.yml:88-92 and crawl-energy-prices.yml:54-58 reuse the long-lived branches `automation/stations` and `automation/energy-prices` via `git push --force-with-lease`, and both re-create the branch with `git checkout -b` each run, so auto-delete on merge is harmless for them — the next run simply recreates the branch.

**Regression risk.** If any workflow assumed a merged branch still exists, auto-delete would break it. Verified not the case: both automation workflows recreate their branch with `git checkout -b "$branch"` (crawl-stations.yml:89, crawl-energy-prices.yml:55) and tolerate a missing remote via `git fetch origin "$branch:..." || true`. No test covers repo settings; verify by merging one dependabot PR and confirming the next crawl run still opens its PR.

**Verifier.** Evidence reproduced verbatim at HEAD a00e34e: `gh api repos/duypham9895/evoyage --jq '.delete_branch_on_merge'` returns `false`. This is a live API read, not a quote from the stale audit doc, so the usual "already fixed in 4 months" failure mode does not apply. Three refutation attempts failed: (1) Not documented as intentional — grep for delete_branch_on_merge/stale branch across all md/yml/json hits only EVOYAGE_AUDIT_PLAN.md:272 and its worktree copy; nothing in docs/adr/ (0001-0010) or any CLAUDE.md. (2) Cited lines are correct — crawl-stations.yml:88-92 and crawl-energy-prices.yml:54-58 …

### `NEW-2` · GET /api/stations silently ignores malformed bounds and returns 500 unfiltered rows

**Area:** code-quality-tests · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/stations/route.ts:47-75. The whole bbox block is wrapped in `if (parts.length === 4 && parts.every((n) => !isNaN(n)))` at line 50. A request like `?bounds=abc` produces `parts = [NaN]`, the guard is false, and control falls past the two explicit 400 responses (lines 57-62, 65-70) straight to the unguarded query at lines 77-81 (`prisma.chargingStation.findMany({ where, orderBy, take: 500 })`) with no latitude/longitude constraint. The route answers 200 with up to 500 unfiltered stations rather than the 400 it returns for an out-of-range or oversized box. Found while checking C28 coverage; there is no test asserting either branch.

**Fix.** Decide the contract and pin it with a test in the new src/app/api/stations/route.test.ts. Recommended: return 400 when `bounds` is present but unparseable, matching the existing 400s at lines 57-62 and 65-70 — i.e. invert the guard to `if (parts.length !== 4 || parts.some(Number.isNaN)) return 400` before the range checks. If the silent-fallback is intentional (map viewport sends garbage during init), leave the code alone and add a test asserting the 200-unfiltered behavior so it stops being accidental.

**Regression risk.** Changing the fallback to a 400 could break the map viewport if any client sends a partial or empty `bounds` during first paint — e2e/stations.spec.ts and e2e/trip-plan.spec.ts both drive the real map and would fail if station markers stop loading. Run those before and after. Grep src/components/map/ for the `bounds=` query construction first to confirm no caller can emit a malformed value.

**Verifier.** Tried to refute; could not. Verified at HEAD a00e34e, file clean in working tree (not part of the VinFast WIP). MECHANICS REPRODUCED EXACTLY. /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/stations/route.ts line numbers are correct, not stale: `if (bounds)` at 47, `const parts = bounds.split(',').map(Number)` at 48, the guard `if (parts.length === 4 && parts.every((n) => !isNaN(n)))` at 50, the two 400 returns at 57-62 and 65-70, and the unguarded `prisma.chargingStation.findMany({ where, orderBy, take: 500 })` at 77-81. Ran the parse in node: `'abc'` -> `[NaN]`, length …

### `NEW-LINT-1` · @typescript-eslint/no-explicit-any — 8 errors, all in one speech test file

**Area:** code-quality-tests · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** All 8 occurrences are in src/lib/speech/web-speech-engine.test.ts: 11:23, 12:22, 13:20, 20:14, 25:21, 26:21, 55:16, 60:16. Read at lines 8-27 — they are SpeechRecognition test-double plumbing: `onresult: null as any` (11), `onerror: null as any` (12), `onend: null as any` (13), `(window as any).SpeechRecognition = Constructor` (20), `delete (window as any).SpeechRecognition` (25), `delete (window as any).webkitSpeechRecognition` (26). Confirmed via `./node_modules/.bin/eslint src scripts -f json` grouped by rule.

**Fix.** Declare a local mock interface for the recognition object (`onresult`/`onerror`/`onend` typed as the real handler signatures or `null`) and widen `window` once instead of eight times — e.g. `const win = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }` at the top of the helper, then use `win.SpeechRecognition`. This is test-only churn with zero production reach.

**Regression risk.** The file under test is src/lib/speech/web-speech-engine.ts; a bad retype of the mock would make the doubles stop matching the real API and the tests would fail loudly rather than silently pass. src/hooks/useSpeechInput.test.ts (10.6K) is the adjacent guard. Run `npm test` and confirm the count stays at 1467 passing — a drop means a test was silently skipped, not fixed.

**Verifier.** Refutation failed on all five standard angles; evidence reproduces exactly. (1) Reproduced at HEAD a00e34e: `eslint src scripts -f json` grouped by rule gives 8 @typescript-eslint/no-explicit-any errors, all in src/lib/speech/web-speech-engine.test.ts, at exactly the cited positions 11:23, 12:22, 13:20, 20:14, 25:21, 26:21, 55:16, 60:16. My totals reconcile with ground truth: 14 errors (8 + 3 triple-slash-reference + 2 set-state-in-effect + 1 react-hooks/refs) and 18 warnings = 32 problems. (2) Not stale, not moved — every line:column matches to the character. (3) No documented exemption: …

### `NEW-LINT-2` · @typescript-eslint/triple-slash-reference — 3 errors, identical line in 3 test files

**Area:** code-quality-tests · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** Three occurrences, all at 2:1 — src/components/landing/VietnamMap.test.tsx, src/components/trip/StationInfoChips.test.tsx, src/components/trip/StationStatusReporter.test.tsx. `grep -n 'reference types'` on all three returns the same line verbatim: `/// <reference types="@testing-library/jest-dom" />`, sitting directly under `// @vitest-environment jsdom` on line 1 (confirmed with awk on lines 1-3 of each file).

**Fix.** Delete the three `/// <reference ... />` lines and pull the types in globally instead — either add `@testing-library/jest-dom` to `compilerOptions.types` in tsconfig.json, or add `import '@testing-library/jest-dom/vitest'` to the vitest setup file. Check whether a setup file is already registered in vitest.config before adding a second mechanism; the other ~100 test files evidently resolve these matchers without the directive, so the reference is likely already redundant.

**Regression risk.** If the matchers are NOT already globally available, removing the directive breaks TypeScript resolution of `toBeInTheDocument`/`toHaveAttribute` in those three files — which surfaces as a `tsc --noEmit` error, not a silent pass. Verify with `npx tsc --noEmit` (currently 0 errors, so any new output is caused by this change) plus `npm test` on the three files.

**Verifier.** Independently reproduced in full; every refutation angle failed. (1) EVIDENCE EXACT: all three `/// <reference types=\"@testing-library/jest-dom\" />` lines exist verbatim at line 2 col 1, directly under `// @vitest-environment jsdom` on line 1. No file moved, no line drift. (2) LINT REPRODUCED: `npx eslint src scripts` (run via `rtk proxy` to bypass the rtk output-filtering hook, which otherwise collapses output to a useless summary) returns 32 problems / 14 errors / 18 warnings — matching ground truth exactly — of which exactly 3 are @typescript-eslint/triple-slash-reference, ALL severity …

### `NEW-LINT-5` · 18 warnings: 7 unused vars, 6 exhaustive-deps, 3 no-img-element, 1 a11y, 1 stale disable directive

**Area:** code-quality-tests · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** Full grouped listing from `./node_modules/.bin/eslint src scripts -f json`. @typescript-eslint/no-unused-vars [7]: scripts/seed-manual-stations.ts:77:50, src/app/api/share-card/route.tsx:113:9, src/components/map/ElevationChart.tsx:53:9, src/components/trip/TripSummary.tsx:18:10 ('getStopStation'), src/lib/geo/elevation.ts:1:15 ('LatLng'), src/lib/routing/mapbox-traffic.test.ts:2:39 ('MapboxTrafficError'), src/lib/routing/route-planner.test.ts:278:11 ('vinFastStops'). react-hooks/exhaustive-deps [6]: src/app/plan/page.tsx:366:6 and 376:6 (both missing 'handleDesktopTabChange'), src/app/plan/page.tsx:883:6 (missing 'geo'), src/components/map/Map.tsx:365:6, src/hooks/useEVi.ts:233:6 (missing 'locale'), src/hooks/usePrecautionaryStopInteractions.ts:85:24 (stale 'dismissTimerRefs.current' in cleanup). @next/next/no-img-element [3]: src/components/trip/ShareButton.tsx:523:21 and 544:21, …

**Fix.** Split by risk, do not batch. Safe now: delete the 7 unused bindings, and delete the dead disable comment at src/app/plan/page.tsx:271 (eslint --fix handles that one — it is the '1 warning potentially fixable' the run reports). Deliberate, not auto-fixable: the 6 exhaustive-deps warnings each encode a real decision about whether the effect should re-run — useEVi.ts:233 missing 'locale' means the callback can answer in a stale language, which is a user-visible bug worth its own check. Leave the 3 no-img-element warnings alone unless ShareButton's canvas/og-image path can tolerate next/image, and treat NearbyStations.test.tsx:60 as a test-fixture fix.

**Regression risk.** Unused-var deletion is inert, but removing the stale disable at plan/page.tsx:271 changes nothing today and may start reporting a real dep gap if that effect is later edited. The dangerous half is exhaustive-deps: adding a missing dependency changes how often an effect fires, which for src/app/plan/page.tsx:883 ('geo') and src/hooks/useEVi.ts:233 ('locale') can mean extra geolocation prompts or repeated LLM calls. Guards that exist: src/hooks/useEVi.test.ts (12.1K) and useEVi-telemetry.test.ts …

**Verifier.** Independently reproduced at HEAD a00e34e. `./node_modules/.bin/eslint src scripts -f json` yields 32 problems (14 errors, 18 warnings), matching ground truth, and all 18 warnings appear at the EXACT cited file:line:column with the exact category split (7 no-unused-vars, 6 exhaustive-deps, 3 no-img-element, 1 jsx-a11y, 1 ruleless). Every refutation path failed: (1) NOT stale — I ran the linter rather than reading the audit doc; (2) line numbers correct — plan/page.tsx:271 reads verbatim `}, []); // eslint-disable-line react-hooks/exhaustive-deps`, and all 7 unused bindings verified in source …

### `C24` · CSP unsafe-inline + unescaped JSON-LD

**Area:** code-security · **Effort:** L · **Status:** PARTIAL

**Evidence.** Both halves the audit called out are fixed. (1) CSP moved out of next.config.ts (see its comment at next.config.ts:3-6; the file now carries only static headers at :24-28) into src/middleware.ts, which mints a per-request nonce (middleware.ts:76-84) and builds `script-src 'self' 'nonce-…' 'strict-dynamic' https: 'unsafe-inline'` at middleware.ts:91. (2) src/app/page.tsx:60 does `JSON.stringify(jsonLd).replace(/</g, '\\u003c')` and page.tsx:66 passes `nonce={nonce}` read from the x-nonce header at page.tsx:55. I verified the nonce actually propagates in production rather than trusting the comment: `curl -sS -D - https://evoyage.duypham.me/` returned `content-security-policy: … 'nonce-gdmBqqPxveFqFg2DmgmLWA==' 'strict-dynamic' …` and all 22 script tags in the body carry that same nonce (e.g. `<script src="/_next/static/chunks/turbopack-0tubfi276f8.0.js" async …

**Fix.** Leave as is unless someone wants the style-src work. Removing style-src 'unsafe-inline' means auditing every inline-style injection path in Mapbox GL JS and Leaflet and either nonce-ing or hashing them — high effort, low payoff while there is no user-controlled style sink. If it is ever picked up, gate it on e2e/csp-smoke.spec.ts plus a manual map-render check.

**Regression risk.** Tightening style-src breaks map rendering (Mapbox/Leaflet inject inline styles). e2e/csp-smoke.spec.ts is the existing guard; it would need a map-visual assertion to actually catch this, since a map that renders unstyled may still pass a DOM-presence check.

**Verifier.** I tried to refute this on five fronts and failed on all five; every cited line number and every piece of evidence reproduced exactly. LINE NUMBERS — all exact, nothing moved. next.config.ts:3-6 carries the "CSP moved out ... to src/middleware.ts in 2026-05-24" comment and the file now holds only five static headers at :24-28 (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS) with no CSP. src/middleware.ts:76-84 is generateNonce() using Web Crypto + btoa; :91 is exactly `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`; :95 is …

### `NEW-2` · RouteCache / VinFastStationDetail prune failures never turn the nightly workflow red

**Area:** data-layer · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/lib/maintenance/prune-stale-caches.ts:60 returns `ok: errors.length === 0`, but /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/cron/aggregate-popularity/route.ts:35-41 drops that flag: it spreads `...popularity` and surfaces the prune errors only as `cacheErrors: caches.errors`. `caches.ok` is never read. And src/lib/station/aggregate-popularity.ts:77-82 returns a hardcoded `ok: true` whenever the UPSERT itself succeeds (the only `ok: false` is the early return at :55-62). The workflow's sole health check is .github/workflows/aggregate-popularity.yml:32 `if echo "$response" | grep -q '"ok":false'`. Net effect: both prunes can fail every night — the exact defect C12 and C16 were opened for — and the job stays green with no alert.

**Fix.** In src/app/api/cron/aggregate-popularity/route.ts:35-41, fold the prune result into the response's top-level ok, e.g. return `ok: popularity.ok && caches.ok` after the spread (the spread currently sets ok from popularity, so the override must come after `...popularity`). No workflow change needed — aggregate-popularity.yml:32 already greps for `"ok":false`.

**Regression risk.** This makes the nightly workflow able to fail where it previously could not, so a pre-existing intermittent prune error would start paging as a red run — that is the intent, but expect one noisy run before it is diagnosed. src/lib/maintenance/prune-stale-caches.test.ts:62 ('returns ok=false when either prune fails') already pins the helper's contract; there is no test over src/app/api/cron/aggregate-popularity/route.ts itself, so add one asserting the composed ok, or the change ships unverified.

**Verifier.** Independently reproduced at HEAD; every cited line number is exact. prune-stale-caches.ts:60 computes `ok: errors.length === 0`, but route.ts:35-41 spreads `...popularity` and surfaces only `cacheErrors: caches.errors` — a repo-wide grep confirms `caches.ok` is read nowhere. aggregate-popularity.yml:32 greps solely for `"ok":false`, and the route returns HTTP 200 unconditionally so `--fail-with-body` never trips. Net effect confirmed: both RouteCache and VinFastStationDetail prunes can throw every night and the job stays green. Refutation attempts all failed: (1) not stale — this is current …

### `NEW-3` · .env.example claims Vercel crons that vercel.json does not contain

**Area:** data-layer · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/.env.example:43-45 describes CRON_SECRET's caller as 'their external scheduler — currently a mix of Vercel crons in vercel.json plus GitHub Actions failsafes in .github/workflows/{aggregate-*,poll-*}.yml'. vercel.json is 10 lines in full and has no `crons` key — only `git.deploymentEnabled: false` (:2-4) and a `functions` memory override (:5-9). docs/operations/cron-setup.md:5 and :16 state the opposite of .env.example and match reality: GHA is the sole scheduler, chosen deliberately to avoid Vercel Hobby's 2-cron cap. The GHA workflows are the primary path, not 'failsafes'.

**Fix.** Reword .env.example:43-45 to name GitHub Actions as the only scheduler and point at docs/operations/cron-setup.md, dropping the vercel.json claim. This is a comment-only edit. (Note this is distinct from audit item C23, which proposed ADDING a `crons:` array to vercel.json — cron-setup.md:16 documents the decision not to, so C23 should be read as resolved-by-decision, not implemented.)

**Regression risk.** Comment text in an example env file; nothing reads it. Zero runtime risk and no test touches .env.example's comments. The only way to get this wrong is to 'fix' it in the other direction by adding a `crons` array to vercel.json — that would double-fire every handler (GHA curl + Vercel cron) against the same DB and contradict docs/operations/cron-setup.md:16.

**Verifier.** I tried to refute this five ways and every attempt failed. The evidence reproduces exactly at HEAD a00e34e. VERBATIM RE-READ (line numbers correct, file not moved): - /Users/edwardpham/Documents/Programming/Projects/evoyage/.env.example:43-45 reads: "# Cron auth — shared secret expected by /api/cron/* handlers (and by their / # external scheduler — currently a mix of Vercel crons in vercel.json plus / # GitHub Actions failsafes in .github/workflows/{aggregate-*,poll-*}.yml)." - /Users/edwardpham/Documents/Programming/Projects/evoyage/vercel.json is 10 lines total, exactly as claimed: …

### `NEW-DESIGN-1` · Hardcoded English "Navigate" in Leaflet station popup despite an existing locale key

**Area:** design-compliance · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** src/lib/geo/map-utils.ts:53 emits the literal string `Navigate` inside the popup HTML. The locale key for exactly this string already exists and is used elsewhere: src/locales/en.json:169 `"popup_navigate": "Navigate"`, src/locales/vi.json:169 `"popup_navigate": "Đi đến trạm"`, consumed by src/components/map/MapboxMap.tsx:267 and :362. The Leaflet path never got the same treatment. The popup is live: src/components/map/Map.tsx:158 `marker.bindPopup(buildStopPopupHtml(stop));`, and src/app/plan/page.tsx:57 `const activeMapMode = hasMapboxToken ? mode : 'osm';` makes Leaflet the guaranteed fallback when no Mapbox token is configured, plus the user-selectable OSM mode.

**Fix.** Give `buildStopPopupHtml` a labels parameter the way `renderMiniCardHtml` already takes `MiniCardLabels` (src/lib/geo/mini-card.ts, imported at src/components/map/Map.tsx:15), then pass `t('popup_navigate')` from Map.tsx:158. Reuse the existing key — do not add a new one.

**Regression risk.** `buildStopPopupHtml` has NO test file — `ls src/lib/geo/` shows map-utils.ts with no map-utils.test.ts, while mini-card, smart-marker, static-map and polyline-simplify all have one. So nothing would catch a broken popup. Changing the signature touches its only call site, src/components/map/Map.tsx:158. Do not confuse this with src/lib/geo/mini-card.test.ts:119-121, which asserts 'Navigate' for the different mini-card renderer — that assertion would need updating only if mini-card is localized …

**Verifier.** Core defect independently reproduced at HEAD, but severity is inflated; corrected P2 -> P3. VERIFIED (every cited line matches exactly): - src/lib/geo/map-utils.ts:53 emits the bare literal `Navigate` inside the anchor built by `buildStopPopupHtml`. Confirmed by grep -n "Navigate" returning exactly that one line in the file. - src/locales/en.json:169 `"popup_navigate": "Navigate"` and src/locales/vi.json:169 `"popup_navigate": "Đi đến trạm"` both exist. - src/components/map/MapboxMap.tsx:267 and :362 both render `{t('popup_navigate')}`, so the Mapbox path is localized and the Leaflet path is …

### `NEW-DESIGN-2` · Emoji ⚡ used as an icon in the live Leaflet station popup

**Area:** design-compliance · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/lib/geo/map-utils.ts:47 renders `⚡ ${station.maxPowerKw}kW | ${connectors} | ${provider}` into popup HTML. This reaches users: src/components/map/Map.tsx:158 binds it as a Leaflet popup, and src/app/plan/page.tsx:57 falls back to the OSM/Leaflet renderer whenever NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is absent. DESIGN.md "Icons" section states "No emoji as UI elements" and "When icons are needed: use simple SVG, 20px standard size"; CLAUDE.md restricts emoji to "user-facing content text (chat messages, descriptions)", which a power/connector metadata row is not.

**Fix.** Drop the ⚡ prefix — the row already reads as power/connector/provider metadata without it, and the two rows above it (lines 42-44) carry meaning through color alone with no glyph.

**Regression risk.** No test file for map-utils.ts (confirmed by `ls src/lib/geo/`), so removing the character is unguarded but also uncaught by any existing assertion — nothing breaks. Fix it in the same pass as NEW-DESIGN-1 since both are in the same function.

**Verifier.** Evidence reproduced exactly, with caveats. VERIFIED: (1) map-utils.ts:47 contains `⚡ ${station.maxPowerKw}kW | ${connectors} | ${provider}` — line number exact, and `git show HEAD:src/lib/geo/map-utils.ts` confirms it is at HEAD a00e34e, not merely working-tree WIP; (2) Map.tsx:158 is `marker.bindPopup(buildStopPopupHtml(stop));` — line number exact, and it is the sole caller of the helper; (3) plan/page.tsx:56-57 is the `hasMapboxToken ? mode : 'osm'` fallback, accurate; (4) DESIGN.md:127-128 quotes are verbatim; (5) no ADR among the 12 in docs/adr/ exempts it (only 0009 matched 'popup', in …

### `NEW-DESIGN-3` · EVi follow-up submit button has no accessible name (arrow glyph only)

**Area:** design-compliance · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/components/EVi.tsx:438-444 — `<button type="submit" disabled={!inputValue.trim()} className="…">→</button>`. No aria-label, no title, no visually hidden text; the accessible name is the bare `→` character. The sibling send button in the same file, src/components/EVi.tsx:632-638, does it correctly: `aria-label="Send"` with `<span className="text-lg">→</span>`. This is a WCAG 4.1.2 name/role/value failure on an interactive control.

**Fix.** Add an aria-label to the button at EVi.tsx:438, matching the pattern already used at line 635. Prefer a locale key over the hardcoded "Send" used at line 635 so both are translatable.

**Regression risk.** src/components/EVi.test.tsx exists and is substantial (~750+ lines). Adding an aria-label changes the button's accessible name, so any test that currently locates this control by text '→' would need updating; grep EVi.test.tsx for '→' before editing — several matches exist (lines 101, 187, 221, 242, 263, 283, 310, 752) but those are assistant message content, not button queries.

**Verifier.** REFUTATION ATTEMPTED AND FAILED on the facts; severity corrected P2 -> P3. What reproduced exactly at HEAD a00e34e: - /Users/edwardpham/Documents/Programming/Projects/evoyage/src/components/EVi.tsx:438-444 is verbatim as claimed: `<button type="submit" disabled={!inputValue.trim()} className="w-11 h-11 ...">` with a bare `→` at line 443 and no aria-label, no title, no visually-hidden text. Line numbers are exact, not stale. - The sibling at EVi.tsx:632-638 does have `aria-label="Send"` (line 635) wrapping `<span className="text-lg">→</span>` (line 637). The asymmetry the finding describes is …

### `NEW-DESIGN-4` · Decorative ↻ glyph paired with a text label inside an interactive button

**Area:** design-compliance · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/components/trip/WaypointInput.tsx:129 `<span>↻</span>` sits directly beside `<span>{isLoopTrip ? t('waypoints_return_to', …) : t('waypoints_loop')}</span>` (line 130) inside the loop-trip toggle button. CLAUDE.md "Less Icons, More Humanity" says "Text over icons — Prefer clear, well-written text labels over icon + label combos" and "If removing an icon doesn't hurt comprehension, remove it" — the label already says it. The glyph also lacks aria-hidden, so it is announced; contrast src/components/landing/LandingPageContent.tsx:284 which correctly writes `<span aria-hidden>→</span>`. Same pattern appears non-interactively at src/components/trip/TripInput.tsx:118 (`↻ {t('waypoints_return_to', { name: start })}` inside a div).

**Fix.** Remove the `<span>↻</span>` at WaypointInput.tsx:129 and the leading ↻ at TripInput.tsx:118. If the glyph is kept for scanability, at minimum add aria-hidden so it is not announced.

**Regression risk.** Neither component has a test file — `find src -name 'WaypointInput.test.tsx'` returns nothing, same for TripInput's loop branch. Removing a span changes no behavior, but the loop-trip toggle is covered only by e2e; re-run the trip-planning Playwright spec after the change.

**Verifier.** Independently reproduced at HEAD a00e34e; could not refute. Both cited lines are exact: WaypointInput.tsx:129 is `<span>↻</span>` directly above the label span at :130 inside the loop-toggle button, and TripInput.tsx:118 is `↻ {t('waypoints_return_to', ...)}` in a div (the finding correctly flags this one as non-interactive). The contrast case at LandingPageContent.tsx:284 is exactly `<span aria-hidden>→</span>`. Refutation attempts all failed: (1) not stale — line numbers exact; (2) no ADR exemption — enumerated all 12 files in docs/adr/, none covers iconography, and DESIGN.md:125-128 …

### `NEW-DESIGN-6` · Emoji 🔋/⚡ in /api/share-card, an endpoint with no consumer anywhere

**Area:** design-compliance · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/share-card/route.tsx:101,104,106,108,111 pass '⚡' and '🔋' into `addRow(icon, …)`, whose `icon` slot otherwise holds text glyphs 'A', 'B' and '···' (lines 101, 105, 111) — inconsistent within one function. However the whole endpoint is dead: `grep -rn "share-card" src e2e scripts` returns exactly one hit, the rate-limit key inside the route itself (route.tsx:47). src/components/trip/ShareButton.tsx has a single API call, `fetch('/api/short-url', …)` at line 116. The route builds `stopsHtml` (line 127) and `grep -rn "stopsHtml" src/` finds no consumer outside the route.

**Fix.** Decide dead-code first: if /api/share-card is genuinely unused, delete the route rather than restyling it. If it is intended to be wired up, normalize the icon slot to text glyphs consistent with the 'A'/'B'/'···' rows before shipping it.

**Regression risk.** Low — nothing imports it, so deletion breaks no caller. Confirm against deployment config before deleting: the route is rate-limited via shareCardLimiter from src/lib/rate-limit, so check whether that limiter is referenced elsewhere, and check Vercel/analytics for live traffic to the path, since an external or manual caller would not appear in a source grep. This is a dead-code call, not purely a design call — flag it to whoever owns the share feature.

**Verifier.** Evidence reproduced at HEAD a00e34e. `grep -rn "share-card" src e2e scripts` returns exactly one hit — the rate-limit key inside the route itself (src/app/api/share-card/route.tsx:47). ShareButton.tsx:116 is `fetch('/api/short-url', …)`, its only API call. `grep -rn "stopsHtml"` yields 3 hits, all inside route.tsx (91, 94, 127), no external consumer. Emoji confirmed present at all five cited lines. Deadness corroborated beyond the grep: no opengraph-image/twitter-image files exist in src/app, no /share page, the route exports POST only (so it is unreachable as an OG-image URL, which crawlers …

### `B21` · Test-count drift persists in three docs — CLAUDE.md's pre-commit gate is 230 tests too low

**Area:** doc-drift · **Effort:** S · **Status:** PARTIAL

**Evidence.** Audit claimed README.md:38 says "728 tests, 54 files"; it now says "Vitest (1304 tests, 115 files), Playwright for E2E (22 tests, 10 spec files on Desktop Chrome)" — so it moved but is still behind. CLAUDE.md:145 "**1237 unit/integration tests** across **105 files**", CLAUDE.md:146 "**19 E2E tests** across **10 spec files**", CLAUDE.md:154 "`npm test` passes (all 1237+ tests green)". AGENTS.md:144, :145, :154 carry the identical stale numbers. Measured now: `find src scripts -name "*.test.ts" -o -name "*.test.tsx" | wc -l` → 133 files (matches the 133 in ground truth); `ls e2e/*.spec.ts | wc -l` → 12 spec files; `grep -h "^\s*test(" e2e/*.spec.ts | wc -l` → 36 `test()` declarations (per file: trip-plan 7, feedback 6, csp-smoke 5, desktop-tabs 3, evi-chat 3, stations 3, bottom-sheet 2, url-state 2, vehicle 2, bilingual 1, precautionary-stop 1, share 1). Ground-truth suite total is 1467. …

**Fix.** Set README.md:38 and CLAUDE.md:145-146 to the measured 1467 tests / 133 files and 12 e2e spec files, add CSP smoke and precautionary-stop to the E2E coverage sentence at CLAUDE.md:147, and change CLAUDE.md:154 from the hardcoded "all 1237+ tests green" to "all tests green" so the checklist stops rotting. Fix AGENTS.md the same way, or delete it per NEW-1. P2 not P3 because CLAUDE.md:154 is a mandatory pre-commit gate: a run that silently dropped 200 tests still reads as passing against a 1237 floor.

**Regression risk.** README.md is machine-rewritten: src/lib/station-stats.ts:27 and :38 regex-replace the `<!-- STATIONS_COUNT_START -->` (README.md:12) and `<!-- ENERGY_PRICES_START -->` (README.md:15-20) blocks on every daily crawl. An edit that disturbs those markers silently breaks the auto-update. src/lib/station-stats.test.ts is the existing test that covers this — run it after touching README.md. Line 38 is outside both marker blocks, so a surgical edit there is safe.

**Verifier.** Facts fully reproduced; severity inflated. VERIFIED: README.md:38 reads "Vitest (1304 tests, 115 files), Playwright for E2E (22 tests, 10 spec files on Desktop Chrome)" — moved off the audit's 728/54 but still behind. CLAUDE.md:145 ("1237 ... 105 files"), :146 ("19 E2E ... 10 spec files") and :154 ("all 1237+ tests green") are exact line hits; AGENTS.md carries the identical text (at :145/:146/:154, not the :144/:145 cited — minor slip), and cmp shows the two files diverge ONLY at line 29 ("Claude Code" vs "Codex"), so the test section is byte-identical. Measured independently: 133 test …

### `B22` · ARCHITECTURE.md still names MiniMax the AI in 3 places and contradicts its own decision table; README/CLAUDE.md portion is fixed

**Area:** doc-drift · **Effort:** S · **Status:** PARTIAL

**Evidence.** Fixed half: README.md:34 now reads "**AI:** OpenAI gpt-5 (primary) + MiniMax M2.7 (fallback) for the eVi trip assistant — provider chain per ADR-0002", and CLAUDE.md:40 matches. Still open: ARCHITECTURE.md:5 "AI-powered trip planning via MiniMax M2.7", ARCHITECTURE.md:47 "MiniMax M2.7 ── AI chat (OpenAI-compatible)" in the External Services box, ARCHITECTURE.md:142 "→ MiniMax M2.7 extracts structured trip data (Zod schema)" in the eVi data-flow. These contradict ARCHITECTURE.md:163 in the same file ("AI model | OpenAI gpt-5 (primary) + MiniMax M2.7 (fallback)") and ARCHITECTURE.md:80 ("llm-providers.ts # OpenAI (primary) + MiniMax (fallback) chain"), and all three are refuted by docs/adr/0010-openai-primary-llm-provider.md:1 ("OpenAI gpt-5 replaces Xiaomi MiMo Flash as primary…Decided 2026-05-26. Implemented same day"). Separately, README.md:34 and ARCHITECTURE.md:163 both attribute …

**Fix.** Rewrite ARCHITECTURE.md:5, :47 and :142 to "OpenAI gpt-5 (primary) + MiniMax M2.7 (fallback)", matching line 163. Add "per ADR-0010" alongside the existing ADR-0002 citation at README.md:34 and ARCHITECTURE.md:163, since ADR-0002 defines the chain mechanism and ADR-0010 sets the current roster. Note the audit's own premise is stale twice over: it said "MiMo is now primary", and MiMo was deleted from the code entirely by ADR-0010 (`grep -rn XIAOMI_MIMO src` finds nothing).

**Regression risk.** Docs only. Before editing, confirm PROVIDER_CHAIN[0] in src/lib/evi/llm-providers.ts is still the OpenAI provider — ADR-0010 is four months old and the doc should be re-pinned to the code, not to the ADR. The existing eVi LLM module tests (provider chain / fallback / telemetry, per CLAUDE.md:147) are what would catch a chain change.

**Verifier.** Could not refute. All cited lines reproduce exactly at the stated line numbers. CONFIRMED OPEN: ARCHITECTURE.md:5 ("AI-powered trip planning via MiniMax M2.7"), :47 ("MiniMax M2.7 -- AI chat (OpenAI-compatible)" in the External Services box, which omits OpenAI entirely), :142 ("-> MiniMax M2.7 extracts structured trip data (Zod schema)"). These are refuted by the same file at :80 and :163 (both name "OpenAI (primary) + MiniMax (fallback)") and by code: src/lib/evi/llm-module.ts:40 is `const PROVIDER_CHAIN: ReadonlyArray<LLMProvider> = [OPENAI_PROVIDER, MINIMAX_PROVIDER]`, so OpenAI is …

### `B24` · ARCHITECTURE.md missing 2 of 19 API routes and 9 source directories; the src/lib/evi block it flagged is already fixed

**Area:** doc-drift · **Effort:** S · **Status:** PARTIAL

**Evidence.** Measured route list: `find src/app/api -name "route.*"` yields 19 routes (share-card is route.tsx, not route.ts). ARCHITECTURE.md:24-40 documents 17. Missing: `/api/admin/feedback/[id]` (grep -c '/api/admin/feedback' ARCHITECTURE.md → 0; file src/app/api/admin/feedback/[id]/route.ts exists) and `/api/feedback/upload` (grep → 0; src/app/api/feedback/upload/route.ts exists). Both shipped in 0.9.0 per CHANGELOG.md:12 and CHANGELOG.md:14 — i.e. undocumented in the same release that documented them elsewhere. The audit's other B24 claims are ALREADY_FIXED: the cron trio is at ARCHITECTURE.md:38-40, nearby/amenities/status-report at :30-33, transcribe at :28, and the `src/lib/evi/` block now lists `llm-module.ts` (:79) and `llm-providers.ts` (:80). New drift in the same directory tree (ARCHITECTURE.md:57-122): `grep -c` returns 0 for `hooks/`, `data/`, `maintenance/`, `station/`, `speech/`, …

**Fix.** Add the two missing routes to the ARCHITECTURE.md:24-40 box and regenerate the §Directory Structure tree from `ls -d src/*/ src/lib/*/ src/components/*/` rather than hand-patching — 9 omissions means the tree was never refreshed after the 0.9.0 and precautionary-stop work. Note src/lib/station/ and src/lib/stations/ are two distinct directories; keep both.

**Regression risk.** Docs only, no test coverage. The trap is regenerating the tree against a working directory that still holds the in-flight Cloudflare-challenge WIP in src/lib/station/ — generate the listing from committed HEAD state so uncommitted files are not enshrined as architecture.

**Verifier.** Refutation failed on every angle; all evidence reproduces exactly at HEAD a00e34e. (1) Counts verified: `find src/app/api -name "route.*" ! -name "*.test.*" | wc -l` = 19, while `sed -n '24,40p' ARCHITECTURE.md | grep -c '/api/'` = 17. (2) Both omissions confirmed: grep for '/api/admin/feedback' and '/api/feedback/upload' in ARCHITECTURE.md each return 0, and both files exist with real handlers (admin .../[id]/route.ts exports PATCH at line 22; feedback/upload/route.ts exports POST at line 65). CHANGELOG.md:12 and :14 are indeed those two 0.9.0 entries. (3) Directory drift confirmed: grep -c …

### `B25` · CHANGELOG.md stops at 0.9.0 (2026-05-24) — 50 commits and two shipped ADRs later, nothing has been added

**Area:** doc-drift · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** `grep -n "^## \[" CHANGELOG.md` → newest entry is CHANGELOG.md:6 `## [0.9.0] — 2026-05-24`. package.json:3 `"version": "0.9.0"` — so the version field and the changelog agree, and the audit's framing ("stops at v0.8.0") is obsolete; the real gap is that both are frozen. `git log --oneline --since=2026-05-24 | wc -l` → 50 commits. Undocumented shipped work includes ADR-0010 OpenAI-primary swap (387158f "feat(evi): replace MiMo Flash with OpenAI gpt-5 as primary LLM", docs/adr/0010-openai-primary-llm-provider.md:1 "Decided 2026-05-26. Implemented same day"), the full ADR-0009 precautionary-stop feature (0833e28, ae52657, ea61306, 8cfc323, 2980840), the Route E logo system (b3d366c), and the production-domain move to evoyage.duypham.me (7706e14, now live in README.md:5).

**Fix.** Open a `## [Unreleased]` section at CHANGELOG.md:6 and backfill from `git log --no-merges --since=2026-05-24`, grouped Added/Changed/Fixed, leading with ADR-0009 and ADR-0010 since both have ADRs to link. Then decide the version bump: the OpenAI provider swap and the precautionary-stop feature are both minor-level, so 0.10.0 with package.json bumped to match.

**Regression risk.** Docs only; nothing imports CHANGELOG.md. The one coupled edit is bumping package.json's version alongside it — check whether any release workflow under .github/workflows/ keys off that field before changing it, so a bump does not fire an unintended release run.

**Verifier.** Survives refutation on every angle; only the severity is inflated. Reproduced independently at HEAD a00e34e: CHANGELOG.md:6 is `## [0.9.0] — 2026-05-24` (newest of 13 headings), `grep -i unreleased CHANGELOG.md` returns NONE, package.json:3 is `"version": "0.9.0"`, and `git log --oneline --no-merges --since=2026-05-24 | wc -l` is 50. All eight cited commits exist with the stated messages/dates (387158f, 0833e28, ae52657, ea61306, 8cfc323, 2980840, b3d366c, 7706e14), and docs/adr/0010-openai-primary-llm-provider.md:3 reads "Decided 2026-05-26. Implemented same day". Not stale-doc parroting: …

### `NEW-2` · CONTEXT.md still declares precautionary extra Stops "out of scope for v1" — ADR-0009 reversed that and it shipped

**Area:** doc-drift · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** CONTEXT.md:77: "…in-trip rerouting and precautionary extra Stops are **out of scope for v1** (ADR-0006)." Reversed by docs/adr/0009-precautionary-extra-stops.md:1-3 ("Decided 2026-05-24. Revisits the rejection in ADR-0006 §'Considered alternatives' → 'Precautionary extra Stops'"). The feature is shipped in code: src/lib/routing/precautionary-stop-builder.ts, src/lib/routing/precautionary-stop-detector.ts, src/lib/trip/precautionary-stop-display.ts, src/hooks/usePrecautionaryStopInteractions.ts, e2e/precautionary-stop.spec.ts, and the env flag at src/app/api/route/route.ts:84 (`process.env.PRECAUTIONARY_STOPS_ENABLED === 'true'`). `git log --since=2026-05-24` shows 5 shipping commits (0833e28, ae52657, ea61306, 8cfc323, 2980840). `grep -n -i precaution CONTEXT.md` returns line 77 only — the glossary has no term for it, even though ADR-0009:33 and :69 both cite "CONTEXT.md tier" …

**Fix.** Add a **Precautionary Stop** entry to CONTEXT.md §Language (Trip planning) distinguishing it from Stop and Alternative, add it to §Relationships, and rewrite the §Flagged ambiguities bullet at line 77 from "out of scope for v1 (ADR-0006)" to "resolved in ADR-0006, reopened and shipped under ADR-0009 (flag-gated)". Per CLAUDE.md's domain-docs rule, CONTEXT.md is the single domain doc — this is the highest-value doc fix after NEW-1, because ADR-0009 derives its own thresholds from vocabulary CONTEXT.md does not define.

**Regression risk.** Docs only — no runtime path reads CONTEXT.md, so no existing test can regress. The risk is the inverse: writing the glossary entry from the ADR without reading src/lib/routing/precautionary-stop-detector.ts would enshrine the ADR's proposed thresholds rather than the shipped ones. Verify the wording against precautionary-stop-detector.test.ts before committing.

**Verifier.** Core claim independently reproduced and survives refutation, but severity is inflated and the headline rationale is false. REPRODUCED: CONTEXT.md:77 reads verbatim "...in-trip rerouting and precautionary extra Stops are out of scope for v1 (ADR-0006)." ADR-0009:1-3 explicitly reverses it ("Revisits the rejection in ADR-0006 ... 'Precautionary extra Stops'"). All 5 cited source files exist (precautionary-stop-builder.ts, precautionary-stop-detector.ts, precautionary-stop-display.ts, usePrecautionaryStopInteractions.ts, e2e/precautionary-stop.spec.ts); the flag citation …

### `NEW-3` · `npm run db:push` no longer exists — 4 stale references, 2 of them in the disaster-recovery runbook

**Area:** doc-drift · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** `node -e "console.log(JSON.stringify(require('./package.json').scripts))"` → scripts contain `db:push:local` and `db:generate`, but no `db:push`. CHANGELOG.md:24 records the rename: "**`db:push` → `db:push:local`** — renamed and wrapped in `scripts/db-push-local.ts`… RECOVERY.md updated to match." RECOVERY.md was only partly updated. Stale callers: README.md:58 (`npm run db:push` inside the Getting Started block), docs/RECOVERY.md:25, docs/RECOVERY.md:146, docs/operations/cron-setup.md:24, docs/operations/cron-setup.md:32. docs/RECOVERY.md:39 already uses the correct `FORCE_DB_PUSH_TO_PROD=1 npm run db:push:local`, so RECOVERY.md contradicts itself.

**Fix.** Replace `npm run db:push` with `npm run db:push:local` at README.md:58, docs/RECOVERY.md:25, docs/RECOVERY.md:146, docs/operations/cron-setup.md:24 and :32. RECOVERY.md:25 and :146 also need the `FORCE_DB_PUSH_TO_PROD=1` prefix that line 39 already carries, since both describe operating against the production DB and scripts/db-push-local.ts refuses a pooler URL without it. Ranked P2 rather than P3 because CLAUDE.md §Operations routes every production-DB disaster to RECOVERY.md, and following it today yields `npm error Missing script: "db:push"` at the worst possible moment.

**Regression risk.** Docs only. The one trap: adding `FORCE_DB_PUSH_TO_PROD=1` to RECOVERY.md:25 turns a safe-by-default command into a production-writing one, so it must stay attached to the Severity-2 context the line already sets. No test covers these files; verify by running `npm run db:push:local` with no env var and confirming the guard in scripts/db-push-local.ts rejects it.

**Verifier.** Tried to refute it five ways; all five attempts failed, so the factual core stands — but the severity is one notch too high. REPRODUCED AT HEAD a00e34e (not stale, not moved, not fixed): - `git show HEAD:package.json` scripts block contains `db:push:local` and `db:generate`, no `db:push`. Working tree matches HEAD (the only WIP is the VinFast Cloudflare files). - `npm run db:push` → `npm error Missing script: "db:push"`, exit 1. The command in the runbook genuinely does not run. - Every cited line number is exact. `git show HEAD:<file> | sed -n '<line>p'` returns the claimed text for …

### `NEW-4` · TODOS.md gates are 100–131 days past target; ADR-0007 is listed as pending but shipped in code

**Area:** doc-drift · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** All four gated items are overdue against today 2026-09-30: TODOS.md:11 ADR-0007 "**Target:** ~2026-06-02" (120 days), TODOS.md:20 ADR-0006 recalibration "~2026-05-22 onward" (131 days), TODOS.md:29 ADR-0008 "~2026-06-22" (100 days), TODOS.md:37 Phase 3b "~2026-06-02" (120 days). ADR-0007 is demonstrably shipped, not pending: src/lib/routing/station-ranker.ts:98-100 ("// ADR-0007 — reliability penalty layer" then `score *= reliabilityMultiplier(input.reliability);`) and src/app/api/cron/aggregate-reliability/route.ts imports `aggregateReliability` from '@/lib/station/aggregate-reliability'. ADR-0008 has no file — `ls docs/adr/` shows 0001-0007, 0009, 0010 with no 0008 — and docs/adr/0009-precautionary-extra-stops.md:3 states "Skips ADR-0008, which is reserved for ADR-0007's telemetry-driven UI exposure", a decision TODOS.md:25-32 does not record. The §Completed block (TODOS.md:47-60) …

**Fix.** Move ADR-0007 from §Timing-deferred to §Completed citing src/lib/routing/station-ranker.ts:98-100, and add ADR-0009 and ADR-0010 to §Completed. Re-date or retire the three genuinely still-gated items — 100+ days past target means either the gate cleared unnoticed or the item is dead, and TODOS.md should say which. Note under ADR-0008 that ADR-0009 consumed the slot by design. Check StationStatusObservation row counts before re-dating: the gates are data-accumulation gates, and four extra months of collection may already have cleared them.

**Regression risk.** Docs only. The substantive risk is the opposite of a regression: re-dating the ADR-0006 recalibration gate without first checking the telemetry could re-defer a magic-number review whose data has been sitting ready since roughly 2026-05-22, so query the observation tables before editing the dates.

**Verifier.** Every cited piece of evidence reproduced exactly at HEAD a00e34e. TODOS.md lines 11/20/29/37 carry the four stale targets (~2026-06-02, ~2026-05-22, ~2026-06-22, ~2026-06-02), all 100-131 days past against 2026-09-30. ADR-0007 is demonstrably shipped, not pending: src/lib/routing/station-ranker.ts:7 imports reliabilityMultiplier, line 98 carries the "// ADR-0007 — reliability penalty layer" comment and line 100 applies "score *= reliabilityMultiplier(input.reliability);"; src/app/api/cron/aggregate-reliability/route.ts:4 imports aggregateReliability and its header cites …

### `B11` · react-hooks/set-state-in-effect: 6 violations reduced to 2, spec still marked Proposed

**Area:** missing-features · **Effort:** S · **Status:** PARTIAL

**Evidence.** `./node_modules/.bin/eslint src scripts 2>&1 | grep -c "set-state-in-effect"` → 2 (not the 6 the audit asserted). The two remaining sites, resolved to files via awk over the eslint output: src/hooks/useIsMobile.ts:12 (`setIsMobile(mql.matches)` inside the mount effect, file is 20 lines total) and src/hooks/useRouteNarrative.ts:162 (`setState(INITIAL_STATE)` in the no-trip-plan branch). Four of the seven spots named in docs/specs/2026-05-04-react-hooks-set-state-cleanup.md:29-41 — src/lib/map-mode.tsx:24/29, src/components/map/MapLocateButton.tsx:54, src/components/trip/ShareButton.tsx:73/100 — no longer report. The spec header at line 3 still reads "**Status**: Proposed (2026-05-04)" despite two-thirds of it having shipped. Full lint state today: 32 problems (14 errors, 18 warnings).

**Fix.** Both remaining fixes are already specified. useIsMobile.ts:12 → `useSyncExternalStore` subscribed to matchMedia with an SSR snapshot of `false` (spec line 29), which preserves the current hydration-safe default. useRouteNarrative.ts:162 → track lastTripId via the ref that already exists at :160 and return INITIAL_STATE from the hook when tripPlan is null, rather than calling setState in the effect body (spec line 41). Then flip the spec header at line 3 from Proposed to Shipped and record what actually landed.

**Regression risk.** useIsMobile drives the mobile-vs-desktop split across the whole app; a wrong SSR snapshot flips every responsive branch and causes hydration mismatches. useRouteNarrative controls narrative reset between trips — a missed reset leaks the previous trip's narrative into the next plan. Guards: src/components/layout/MobileTabBar.test.tsx and DesktopTabBar.test.tsx exercise the mobile/desktop split, and the bottom-sheet and desktop-tabs Playwright specs cover the responsive paths end to end.

**Verifier.** Independently reproduced. `eslint src scripts` yields exactly 2 react-hooks/set-state-in-effect errors at the precise cited locations: src/hooks/useIsMobile.ts:12:5 (setIsMobile(mql.matches) in the mount effect; file is 20 lines) and src/hooks/useRouteNarrative.ts:162:7 (setState(INITIAL_STATE) in the !tripPlan branch). Both are production hooks, not tests/scripts. Total lint state 32 problems / 14 errors / 18 warnings, matching. docs/specs/2026-05-04-react-hooks-set-state-cleanup.md line 3 still reads "**Status**: Proposed (2026-05-04)" with only one commit (5f07ab6) in its history. …

### `B12` · Feedback admin UI shipped; missing internal notes, category/date filters, and image rendering

**Area:** missing-features · **Effort:** S · **Status:** PARTIAL

**Evidence.** Largely ALREADY_FIXED versus the audit's "only Resend email notify is wired". Shipped: list at src/app/admin/feedback/page.tsx (134 lines) with a status filter at :8-10 and paging at :11; detail at src/app/admin/feedback/[id]/page.tsx (85 lines); status PATCH at src/app/api/admin/feedback/[id]/route.ts (64 lines); StatusActions client component (67 lines); Basic Auth gate at src/middleware.ts:48-69 with constant-time compare at :69 and `isAdmin` matching at :109; noindex belt-and-braces at src/app/admin/layout.tsx:10 plus `X-Robots-Tag` at middleware.ts:43; status/resolvedAt at prisma/schema.prisma:257-258. Three D.4 criteria remain unmet: `grep -rn "adminNote" src/ prisma/` returns zero hits so there is no internal-note field or UI; page.tsx:25 accepts only `status` in searchParams, so there is no category or date filter; and detail page.tsx:74 renders `field('Image URL', …

**Fix.** Smallest-first. (1) Render the image: at src/app/admin/feedback/[id]/page.tsx:74, branch on imageUrl and emit an `<img>` (or next/image) instead of routing it through the generic `field` text helper — this is the one that actually changes triage speed, since the whole point of B1 was letting the team verify a report visually. (2) Add category and date-range params alongside status in the searchParams type at page.tsx:25 and the `where` at :33. (3) Add `adminNote String?` to the Feedback model and a textarea in StatusActions only if the PM still wants it — three months of use may have shown the status workflow is enough.

**Regression risk.** The image render is behind Basic Auth and touches one line; near-zero blast radius. Widening the `where` clause at page.tsx:33 risks an unindexed scan — prisma/schema.prisma has an index on the fields used today, so confirm category/createdAt are covered before filtering on them. A schema change for adminNote requires a migration and touches the same model the live feedback POST writes to (src/app/api/feedback/route.ts:123); src/app/api/admin/feedback/[id]/route.test.ts is the existing guard …

**Verifier.** Independently reproduced at HEAD a00e34e; could not refute. All three claimed gaps verified in live code, and every cited line number is exact. GAPS CONFIRMED: (1) `grep -rn "adminNote" src prisma` returns zero hits — no internal-note column or UI; a broader grep for internal_note/admin_note also returns nothing. (2) /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/admin/feedback/page.tsx:25 declares `searchParams: Promise<{ status?: string }>` and the `where` at :33 is `status === 'ALL' ? {} : { status }` — no category or date filter. (3) …

### `B13` · Feedback image upload UI: uploader shipped, admin viewer surface still text-only

**Area:** missing-features · **Effort:** S · **Status:** PARTIAL

**Evidence.** B13 was restated in the audit because the feature has two consumer surfaces. Uploader surface: ALREADY_FIXED — src/components/feedback/FeedbackImageUpload.tsx exists, is mounted at src/components/feedback/FeedbackModal.tsx:440, holds state at FeedbackModal.tsx:64, and submits at :198, with per-error locale messages at FeedbackImageUpload.tsx:29-39. Admin viewer surface: still missing — src/app/admin/feedback/[id]/page.tsx:74 passes imageUrl through the generic `field` helper, which stringifies at :20, so the reviewer sees a URL to copy-paste rather than the photo.

**Fix.** Same one-line change as B12's first item: special-case imageUrl at src/app/admin/feedback/[id]/page.tsx:74 to render the image. Treat B13 as closed once that lands, since the uploader half is already done and B1 separately tracks the EXIF gap.

**Regression risk.** Behind Basic Auth, one render branch, no data or schema change. If next/image is used, the Vercel Blob hostname must be added to next.config.ts remotePatterns or the image silently fails to load — a plain `<img>` avoids that entirely and is the safer choice here.

**Verifier.** Could not refute — all five cited lines reproduce exactly at HEAD a00e34e. Uploader half verified ALREADY_FIXED: FeedbackImageUpload.tsx exists (117 lines, per-error locale mapping at :29-38); FeedbackModal.tsx has import :6, state :64, submit :198, mount :440 (gated by UPLOAD_CATEGORIES). Admin viewer half verified STILL missing: src/app/admin/feedback/[id]/page.tsx:74 is literally `{field('Image URL', row.imageUrl)}` and field() stringifies at :20 via `{String(value)}`; a repo-wide grep for imageUrl in src/ returns exactly one admin hit and there is no <img> anywhere under src/app/admin/. …

### `NEW-OPS-11` · Transient VinFast upstream failures exit 0, so the polling workflow stays green while collecting no data indefinitely

**Area:** ops-resilience · **Effort:** M · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/station/vinfast-upstream-error.ts:77-100 — `classifyVinfastCronError` returns `{ action: 'skip', result: { ok: true, skipped: true, ... } }` for anything `isTransientVinfastUpstreamError` accepts, which per :25-39 is every timeout, network_error, 5xx, 408 and 429. scripts/poll-vinfast-station-status.ts:139-149: on the skip path it prints a `::warning` and `return`s WITHOUT setting `process.exitCode`, so the job exits 0 and the workflow is green; the same pattern is at scripts/refresh-vinfast-cookies.ts:160-172. A GitHub `::warning` annotation triggers no notification. Downstream, .github/workflows/aggregate-popularity.yml:32 and aggregate-reliability.yml:33 only check `"ok":false` from the aggregation itself, which succeeds happily on a shrinking observation set — so a multi-week VinFast outage produces no red run …

**Fix.** Keep exit 0 (the skip exists so a transient upstream blip does not page anyone), but make the silence bounded: have the poll job assert that the most recent StationStatusObservation is younger than N cycles and fail when it is not, or emit the skip count to a monitor. The staleness gate in NEW-OPS-7 is the other half of this fix.

**Regression risk.** Failing on a staleness threshold will turn the workflow red during any genuine multi-hour VinFast outage, which is the behaviour the skip path was added to suppress — pick the threshold generously. src/lib/station/vinfast-upstream-error.test.ts pins the current skip/fail classification and must keep passing.

**Verifier.** I tried to refute this and could not — every cited line reproduces exactly at HEAD a00e34e with the WIP applied. VERIFIED (line numbers all correct, no file moved): - /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/station/vinfast-upstream-error.ts:77-100 — `classifyVinfastCronError` returns `{action:'skip', result:{ok:true, skipped:true, ...}}` for anything `isTransientVinfastUpstreamError` accepts; :25-39 accepts timeout, network_error, any 5xx, 408, 429. Exact. - /Users/edwardpham/Documents/Programming/Projects/evoyage/scripts/poll-vinfast-station-status.ts:139-149 — the …

### `NEW-OPS-15` · The /api/cron/poll-station-status endpoint is dead code that is still deployed and authenticated, and its docstring contradicts the live scheduler

**Area:** ops-resilience · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/cron/poll-station-status/route.ts:12 claims "Hourly poller invoked by cron-job.org". The live scheduler does not call it: .github/workflows/poll-station-status.yml:65 runs `npx tsx scripts/poll-vinfast-station-status.ts`, and the workflow's own comment at :12-15 explains why ("VinFast/Cloudflare ... can still reject Vercel's server-side replay of those cookies with 403. Poll from a Chromium context on the GitHub runner instead of POSTing the Vercel endpoint"). No curl to that path exists in any workflow — only aggregate-popularity.yml:27 and aggregate-reliability.yml:28 POST to the cron API. Separately, src/app/api/route/narrative/route.ts:6-8 sets `maxDuration = 70` reasoning "30s × 2 providers = 60s, leaving 10s of headroom", which contradicts src/app/api/cron/poll-station-status/route.ts:7 `export const maxDuration …

**Fix.** Delete src/app/api/cron/poll-station-status/route.ts, or update its docstring to say it is a manual-recovery endpoint. Separately, reconcile the maxDuration figures: confirm the Vercel plan, then either lower narrative to 60 and cut the per-provider timeout to ~25s, or correct the misleading 'Hobby ceiling' comment.

**Regression risk.** Deleting the route removes a manual recovery lever — the browser-based script is now the only way to poll, and it requires a GitHub runner. Confirm nothing external (a cron-job.org entry outside this repo) still hits the URL before removing it. src/lib/station/poll-status.ts and its tests are shared with the script and must not be touched.

**Verifier.** Every cited fact reproduces exactly at HEAD a00e34e; I could not refute any of it. (1) src/app/api/cron/poll-station-status/route.ts:12 still reads "Hourly poller invoked by cron-job.org" — verbatim, correct line. (2) The live scheduler does not call it: .github/workflows/poll-station-status.yml:65 is `run: npx tsx scripts/poll-vinfast-station-status.ts`, and grep confirms no workflow curls that path — only aggregate-popularity.yml:27 and aggregate-reliability.yml:28 POST to the cron API, both verified at the exact cited lines. (3) Git history refutes the "already fixed / stale doc" failure …

### `NEW-7` · A best-effort route-cache write sits on the critical path: any Prisma error discards a fully computed trip plan and returns 500

**Area:** runtime-correctness · **Effort:** S · **Status:** STILL_OPEN

**Evidence.** src/app/api/route/route.ts:280-284 `await setCachedRoute(...)` and :250-255 (Mapbox branch) are bare awaits inside the big try that ends at :719. src/lib/routing/route-cache.ts:65-80 issues `prisma.routeCache.upsert(...)` with no internal error handling, and :39-41 `getCachedRoute` likewise awaits `prisma.routeCache.findUnique` unguarded at route.ts:212 and :261. The same file shows the intended pattern two hundred lines later: the reliability lookup at route.ts:413-426 is wrapped in try/catch with the comment 'Reliability lookup is best-effort — never block the trip plan', and the popularity lookup at :667-677 with 'Heatmap lookup failure must never break the trip plan'. The cache calls were not given that treatment. Failing input: a Supabase pooler connection-pool timeout (Prisma P2024) or a dropped connection (P1001) while `prisma.routeCache.upsert` runs at route-cache.ts:65, after …

**Fix.** Wrap all four cache calls the way route.ts:413-426 already does: `try { await setCachedRoute(...) } catch (err) { console.warn('Route cache write failed; continuing', err); }`, and for the reads `const cached = await getCachedRoute(...).catch(() => null);`. No behavioural change on the happy path.

**Regression risk.** Swallowing cache errors hides a genuinely broken RouteCache table — pair it with the console.warn so the failure is still observable, and do not swallow errors from fetchDirections* itself (route.ts:274-279, :287), which must keep reaching the status-code mapping at :731-754. src/app/api/route/route.test.ts covers the response contract and would catch an over-broad catch that starts returning 200 on a real routing failure.

**Verifier.** Tried to refute; the mechanical claim survives, but the severity does not. VERIFIED EXACTLY at HEAD a00e34e (every cited line matches, nothing moved): - /Users/edwardpham/Documents/Programming/Projects/evoyage/src/app/api/route/route.ts:212 and :261 — bare `await getCachedRoute(...)`; :250 and :280 — bare `await setCachedRoute(...)`. All four sit inside the big `try {` that opens at :189 and is caught at :719. - /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/routing/route-cache.ts:39 `await prisma.routeCache.findUnique` and :65 `await prisma.routeCache.upsert` — zero …

## Refuted by the verifier — do NOT action these

Each was raised by a triage agent and then killed by an independent skeptic. Listed so
nobody re-raises them from the stale audit.

- **`NEW-LINT-0b`** Pre-commit hook blocks errors only on staged files, so the 14 existing errors are permanently invisible  
  Mechanism reproduces, headline conclusion and causal story do not. VERIFIED: .husky/pre-commit = `npx lint-staged`; core.hooksPath = .husky/_; package.json:25-27 = `"*.{ts,tsx}": "eslint --quiet --no-warn-ignored"`; lint-staged 16.4.0; eslint on useIsMobile.ts exit=1, on elevation.ts exit=0; 14 errors/18 warnings; no lint step in …
- **`NEW-DESIGN-5`** Emoji ⚡ as an SVG chart marker, inconsistent with the numbered-circle markers beside it  
  REFUTED on two independent grounds, though the raw line-level evidence does reproduce exactly. WHAT IS TRUE: /Users/edwardpham/Documents/Programming/Projects/evoyage/src/components/map/ElevationChart.tsx line 284 has the comment `{/* Charging stop markers (⚡) */}`, line 296 renders the bare glyph `⚡` inside `<text … fontSize="12">`, and …
- **`B7`** ADR-0008 reliability UI exposure: gate passed ~3 months ago AND can never clear on its own  
  Raw evidence reproduces, but the load-bearing claims are refuted. VERIFIED TRUE: no docs/adr/0008-*.md; TODOS.md:25-32 gate with target ~2026-06-22 (3mo stale); ADR-0007 shipped (route.ts:17 RELIABILITY_THRESHOLD import, route.ts:404-418 reliabilityMap); zero hits for reliability_gated_count/reliability_distribution in src/ and …
- **`B6`** ADR-0005 EviTripExtractor Module still not shipped; parse handler grew to 325 lines  
  NOT refuted on raw facts — to be unambiguous: the EviTripExtractor module genuinely does not exist. I reproduced every measurement (grep for extractTrip/EviTripExtractor/ready_to_plan/needs_followup/parse_failed returns 0 hits; src/lib/evi/ holds only llm-module, llm-providers, minimax-client, prompt, suggestions-client, types, vehicle- …
- **`B9`** ADR-0006 magic-number recalibration: all 4 gating events work and the gate cleared ~4 months ago  
  REFUTED on the finding's load-bearing premise. The claim's whole case — and its explicit contrast with B7 — is "these four all exist AND fire from client components, so the data really has accumulated." They do not fire. PostHog never initializes in production, so all four events have been no-ops since the day they shipped. Four …
- **`B8`** Phase 3b popularity calibration: gate cleared ~4 months ago, UI still ships insufficient-data  
  REFUTED. Every cited line reproduces (TODOS.md:34-41, /Users/edwardpham/Documents/Programming/Projects/evoyage/src/lib/station/popularity-query.ts:19 THRESHOLD=20 and :84-85 insufficient-data, prisma/schema.prisma:148-156, src/app/api/route/route.ts:12, src/components/trip/StopPopularity.tsx:40-49, …
- **`B4`** ADR-0003 VinFast detail Module: partially advanced since the status doc, still not shipped  
  REFUTED on its central novel claim. B4's whole reason to exist is "partially advanced since the status doc — the stage-callback slice of the ADR did land." That is false, proven two ways. (1) Git says nothing advanced. `git show 489a820:src/lib/vinfast/vinfast-client.ts | grep -n "StageCallback\|onStage"` — where 489a820 IS the commit …
- **`B10`** Third-party charging ≥5% network share target still unmeasured  
  REFUTED — the citations are accurate but the evidence carries no signal, and the underlying work shipped. 1) The load-bearing evidence ("still an unchecked `- [ ]`") is worthless in this repo. docs/plans/2026-05-01-third-party-charging-implementation.md has 0 of 23 boxes checked; across all 21 files in docs/plans/ there is exactly 1 …
- **`B18`** AddCustomVehicle has no CHANGELOG, ADR or CONTEXT entry — only a March design plan and a security-audit finding  
  REFUTED on its two checkable assertions, both false at HEAD a00e34e. (1) "CHANGELOG.md 0 hits for 'custom vehicle'" is a grep artifact, not absent coverage. CHANGELOG.md:288, inside `## [0.1.0] — 2026-03-17` **Added**, reads: "- Support for 15+ EV models (VinFast, BYD, Tesla, custom)". That is the same sentence the triager cited …
- **`B19`** LocaleTitleSync is undocumented everywhere — zero mentions in any doc in the repo  
  REFUTED — the headline claim ("zero mentions in any doc in the repo") is factually false. The feature is documented in three places I opened and verified: (1) CHANGELOG.md:49 under "### Changed" — "**Document.title syncs with locale toggle** (commit `4cb834c`) — title no longer stays stuck on initial language after toggle."; (2) …
- **`B17`** SampleTripChips appears only in a CHANGELOG test-file list, never as a feature entry  
  REFUTED on the primary evidence. The finding claims SampleTripChips's "single CHANGELOG appearance is CHANGELOG.md:89" inside a `### Tests` block, with "never an `### Added` entry." False: /Users/edwardpham/Documents/Programming/Projects/evoyage/CHANGELOG.md:68 sits inside the 0.8.0 `### Added` block (which opens at line 65) and reads …
- **`NEW-OPS-2`** Nominatim geocoding is an unguarded single point of failure in trip planning; its error message matches no branch of the /api/route classifier and degrades to a generic 500  
  Code facts reproduce exactly, but the P1 impact premise ("single point of failure in trip planning") is refuted: the cited path is unreachable from the product. VERIFIED TRUE: osrm.ts:67-96 geocodeAddress hits only nominatim.openstreetmap.org and throws `Nominatim geocoding error: ${status}` at :83 with no geocoder fallback; it is …
- **`NEW-OPS-10`** The two VinFast workflows overlap by design but declare no concurrency group, and both the cookie prune and the observation insert are unguarded read-then-write races  
  REFUTED — the static facts check out but the causal chain does not, in four independent places. WHAT HOLDS: Neither VinFast workflow declares `concurrency:` (`grep -l` returns only crawl-energy-prices.yml, crawl-stations.yml, deploy.yml). Crons confirmed at refresh:13 `0 */2 * * *` and poll:21 `5 */2 * * *`; `workflow_dispatch` at …
- **`AGENT-2`** CLAUDE.md sends agents to GitHub issues for the backlog, but there are 0 open issues — the real 1586-line backlog is EVOYAGE_AUDIT_PLAN.md  
  REFUTED. The reproducible half of the evidence is true but the inference built on it is factually wrong. WHAT REPRODUCES: `gh issue list --state open --json number --jq 'length'` → 0; closed → 8. docs/agents/issue-tracker.md:1-3 does say GitHub is the tracker, line 21 does say "Create a GitHub issue", line 25 does say `gh issue view`. …
- **`AGENT-6`** No .claude/settings.json or settings.local.json exists — zero hooks, permissions or agent config are wired at project level  
  REFUTED on the headline and on the stated impact; only a narrow, cosmetic residue survives. VERIFIED TRUE (narrow facts): no .claude/settings.json or settings.local.json exists (glob, `git ls-files`, and repo-wide `find -name "settings*.json"` all empty); no .claude/hooks/ directory; `grep -n evoyage ~/.claude/settings.json` → no match; …
- **`NEW-1`** Orphaned worktree .worktrees/dependabot-integration — 47 commits behind main, holds 1 unmerged commit, no open PR  
  REFUTED on its load-bearing claims. (1) The "1 unmerged commit" carries ZERO unmerged content: `git diff main codex/dependabot-calm-cycle -- .github/dependabot.yml` returns EMPTY, and `git cherry main codex/dependabot-calm-cycle` returns `- 02644ab` (leading `-` means an equivalent patch is ALREADY in main). main's …

## Already fixed since the audit — no action

- **`C10`** 3 Playwright browsers in deploy.yml is correct, not waste — the audit's premise was wrong
- **`C1`** refresh-vinfast-cookies networkidle TimeoutError — fixed, 100/100 runs green
- **`C2`** poll-station-status cookies_expired cascade — eliminated by re-architecture, 99/100 runs green
- **`C3`** main branch protection now enabled with Deploy to Vercel required and force-push blocked
- **`C4`** deploy.yml has workflow_dispatch for manual replay
- **`C5`** concurrency groups present on all three auto-commit/deploy workflows
- **`C6`** Node bumped 20 to 22 across all workflows and engines.node added
- **`C7`** release.yml has run successfully; awk CHANGELOG extractor is proven, not untested
- **`C8`** .github/dependabot.yml exists and is actively producing PRs
- **`C12`** RouteCache unbounded growth — nightly 30-day prune + 24h read TTL now in place
- **`C13`** RECOVERY.md now covers EVPower, energy prices, manual stations, and the cold-start degradation window
- **`C14`** All 11 env vars the audit named are now documented in .env.example
- **`C15`** ShortUrl.expiresAt is now written at creation with a 1-year TTL
- **`C16`** VinFastStationDetail now pruned at 30 days in the nightly cron
- **`C17`** db:push renamed to db:push:local with a pooler-host guard
- **`C18`** prisma migrate diff drift gate is live in the deploy workflow
- **`C19`** Cookie JSON.parse is wrapped in try/catch and degrades to a typed failure result
- **`C21`** Cron schedules are documented in docs/operations/cron-setup.md and match the live workflows
- **`C22`** No rate limit on paid Groq transcribe endpoint
- **`C23`** No crons array in vercel.json — cron handlers won't fire
- **`C25`** console.log left in production code
- **`C26`** package.json missing engines.node
- **`C27`** Colocated test for the paid Groq transcribe endpoint
- **`NEW-DESIGN-5`** Emoji ⚡ as an SVG chart marker, inconsistent with the numbered-circle markers beside it
- **`C29`** Emoji in vehicle filter buttons + selected vehicle card + AddCustomVehicle
- **`QA-1`** Emojis in vehicle filter buttons (🇻🇳 Xe tại VN / 🌍 Tất cả)
- **`QA-2`** Emojis in selected vehicle card (🔋 / 📏 / ⚡)
- **`C30`** Footer GitHub URL points at wrong account (edwardpham94)
- **`QA-3`** Footer GitHub link 404s on wrong account
- **`C31`** Hero image alt text does not switch on locale
- **`QA-5`** Map hero alt-text stays Vietnamese in English mode
- **`C32`** MapLocateButton hydration mismatch on mobile
- **`QA-6`** React hydration mismatch warning from MapLocateButton
- **`QA-4`** Page <title> does not switch on locale
- **`B9`** ADR-0006 magic-number recalibration: all 4 gating events work and the gate cleared ~4 months ago
- **`B8`** Phase 3b popularity calibration: gate cleared ~4 months ago, UI still ships insufficient-data
- **`B10`** Third-party charging ≥5% network share target still unmeasured
- **`B2`** trackPageView is fully instrumented — audit's defined-but-0-callers finding no longer holds
- **`B3`** trackEviMessage is fully instrumented in useEVi — audit finding no longer holds
- **`B14`** Trip Notebook is fully shipped against its spec — the audit's size-based suspicion was wrong
- **`B15`** Dangling Smart Map Marker design-doc reference in TODOS.md has been resolved with an explicit note
- **`B18`** AddCustomVehicle has no CHANGELOG, ADR or CONTEXT entry — only a March design plan and a security-audit finding
- **`B19`** LocaleTitleSync is undocumented everywhere — zero mentions in any doc in the repo
- **`B17`** SampleTripChips appears only in a CHANGELOG test-file list, never as a feature entry
- **`B16`** EViNudge — audit cited the wrong path and the wrong premise; the component is specced and changelogged
- **`B20`** StarRating was specced in the feedback PRD all along — not scope creep
- **`B23`** README province count already corrected 63 → 34
- **`B26`** TODOS.md dangling design-doc reference resolved with an explicit note
- **`NEW-OPS-13`** Rate-limit coverage is complete across all 19 API routes — no public endpoint is unprotected
- **`NEW-OPS-14`** The documented OSRM 502 QA blocker and the C12/C16 unbounded-cache items are fixed in live code
- **`AGENT-2`** CLAUDE.md sends agents to GitHub issues for the backlog, but there are 0 open issues — the real 1586-line backlog is EVOYAGE_AUDIT_PLAN.md
- **`NEW-1`** Orphaned worktree .worktrees/dependabot-integration — 47 commits behind main, holds 1 unmerged commit, no open PR
- **`AGENT-7`** The 5 preserved worktrees from the 2026-05-01 multi-agent build are already gone — .claude/worktrees/ is empty

