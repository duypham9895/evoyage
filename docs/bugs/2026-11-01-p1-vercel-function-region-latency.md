# P1: Vercel functions run in iad1, database is in ap-southeast-1

> **Status 2026-11-02:** fixed on this branch — `vercel.json` now pins `"regions": ["sin1"]` (owner authorised shipping on 2026-11-02). Verify after deploy: `x-vercel-id` shows `::sin1::` and DB-route TTFB drops. Still open: why `/api/vehicles` takes 6-12 s (not a region issue).

## Summary

Every serverless function runs in Vercel's default region, iad1 (US East). The Supabase Postgres database is in ap-southeast-1 (Singapore). A user in Vietnam is routed hkg1 edge → iad1 function → Singapore DB, so every Prisma round trip crosses the Pacific. DB-backed API calls take seconds even when they run a single query.

## Severity and priority

- Severity: **medium**. Performance only; no feature is broken.
- Priority: **P1**. It slows every DB-backed request for every user, and the likely fix is a one-line config change.

## Affected features

Every route that touches Prisma, for example `/api/vehicles`, `/api/stations/[id]/vinfast-detail`, `POST /api/route`, and the server-rendered pages that read from the DB. Outbound calls to Asian APIs (VinFast, MiniMax) also pay the extra distance.

## Finding 1: no function region configured

### Symptom

DB-backed routes are slow. A single `findUnique` on a nonexistent station id takes 2-5 s to first byte. The same route with an id that is rejected before the DB takes under 1 s most of the time.

### Evidence

Code at `64db6f92e0792aa4643b2ba76958ff0843b80567`:

- `vercel.json:1-11`: only `git.deploymentEnabled: false` and `functions["src/app/api/stations/[id]/vinfast-detail/route.ts"].memory: 512`. No `regions` key.
- `grep -rn "preferredRegion" src next.config.ts` → no matches. No route sets its own region.
- `next.config.ts` sets no region.
- `docs/RECOVERY.md:32`: "Region: `ap-southeast-1` (Singapore — closest to Vietnam users)." `CLAUDE.md:41` says the same.
- Verifiers read the `.env` hostnames with credentials masked: `DATABASE_URL` and `DIRECT_URL` point at `aws-1-ap-southeast-1.pooler.supabase.com`.
- `docs/plans/2026-05-03-feedback-bugs-investigation.md:115` already recorded "Vercel function region defaults to iad1". Its proposed `preferredRegion = 'sin1'` (for `/api/evi/parse` only) was never applied.

Live prod, re-checked 2026-11-01 by the author with read-only GETs:

```
$ curl -sS -D - -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer}\n' <url> | grep -iE 'x-vercel-id|status='

/api/vehicles                                          x-vercel-id: hkg1::iad1::...   200   8.84 s, 11.93 s
/api/stations/abcdefghij0123456789xyz/vinfast-detail   x-vercel-id: hkg1::iad1::...   404   4.81 s,  3.78 s   (one DB query)
/api/stations/bad/vinfast-detail                       x-vercel-id: hkg1::iad1::...   400   0.68 s,  2.63 s   (rejected before DB)
```

Verifier runs earlier the same day: nonexistent-id route 1.59-5.13 s, invalid-id route 0.49-1.31 s, `/api/vehicles` about 6-7 s on every call.

The middle segment of `x-vercel-id` is the function region. `iad1` on every request means the dashboard does not override the default either.

### Root cause

- **Established:** no region is set in `vercel.json`, in any route (`preferredRegion`), or in effect on the Vercel project (live header shows `iad1`). The DB is in ap-southeast-1. Each network round trip between them costs roughly 200+ ms.
- **Hypothesis:** most of the seconds come from opening a new pooler connection (TLS + Postgres startup, several round trips) across that distance, on top of cold starts. Cold start, connection setup and query count were **not** separated, so the "about 2 s per request" figure is approximate.
- **Not explained by region alone:** `/api/vehicles` takes 6-12 s every time. That needs its own investigation (query count, payload size, caching) and should not be assumed fixed by the region change.

### Repro

```bash
curl -sS -D - -o /dev/null https://evoyage.duypham.me/api/vehicles | grep -i x-vercel-id
# expect after fix: hkg1::sin1::...   today: hkg1::iad1::...

for i in 1 2 3; do
  curl -sS -o /dev/null -w '%{http_code} %{time_starttransfer}\n' \
    https://evoyage.duypham.me/api/stations/abcdefghij0123456789xyz/vinfast-detail
done
# compare with an id rejected before the DB:
for i in 1 2 3; do
  curl -sS -o /dev/null -w '%{http_code} %{time_starttransfer}\n' \
    https://evoyage.duypham.me/api/stations/bad/vinfast-detail
done
```

All of these are GETs with no side effects.

### Regression test

`src/lib/__tests__/vercel-region.test.ts` › `Vercel function region` › `pins serverless functions to sin1, next to the ap-southeast-1 database` (marked `it.fails`).

It reads `vercel.json` and asserts `regions` equals `["sin1"]`. It encodes the repo-side config only. The latency itself is live infrastructure behaviour and is **not unit-testable**: confirm it with the curl commands above after deploy.

If the fixer chooses to set the region only in the Vercel dashboard instead of `vercel.json`, this test will stay red. Prefer `vercel.json` so the setting is version-controlled; otherwise rewrite the test to match the chosen mechanism and say why in the PR.

### Fix direction

- Add `"regions": ["sin1"]` to `vercel.json` (or set the project's Function Region to Singapore). `sin1` is Vercel's Singapore region, beside Supabase ap-southeast-1.
- Then flip `it.fails` → `it` in the test above.
- After deploy, check `x-vercel-id` shows `::sin1::` and re-measure TTFB with the repro commands.
- Gotchas:
  - This is a deploy config change: it needs Duy's explicit go before it reaches prod.
  - Plan tier: `docs/plans/2026-05-03-feedback-bugs-investigation.md:148` claims Hobby ignores `preferredRegion`. Check the current Vercel docs for whether a single `regions` entry in `vercel.json` is honoured on this project's plan before relying on it. The live `x-vercel-id` after deploy is the real check.
  - Any third-party API that is US-only would get slower after the move. VinFast and MiniMax are in Asia; OpenAI is global. Worth a quick check of each outbound dependency.
  - Do not use the per-route `preferredRegion` for one route only: every DB route has the same problem.

## Related low-severity items

None in this group.

## Open questions / what to verify first

1. Which Vercel plan is the project on, and does it honour `regions` / Function Region? Verify before merging the fix.
2. After the move, how much of the latency remains? Measure DB-only routes with warm and cold functions separately.
3. Why does `/api/vehicles` take 6-12 s? Investigate separately; region alone does not explain it.

## Verification provenance

- Found during a full audit of eVoyage on 2026-11-01.
- Checked by 2 adversarial verifier agents on 2026-11-01 against HEAD `bfa3a3b` and live prod. Both confirmed the finding (severity medium, not refuted). One flagged that the ~2 s magnitude is not proven to come from region alone.
- Re-confirmed by the author at `64db6f92e0792aa4643b2ba76958ff0843b80567` (code) and on live prod (headers and timings above) the same day.
- All agents are Claude: same vendor, same priors; no external verifier ran.
