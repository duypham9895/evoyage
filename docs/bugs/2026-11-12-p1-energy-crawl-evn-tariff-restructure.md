# Crawl Energy Prices fails daily (P1): EVN replaced the 6-tier tariff and repurposed the page we scrape

Date: 2026-11-12 · Code refs at `31f17a3` (origin/main) · Tracking issue #176 · Stuck PR #175

> **Status 2026-11-12:** diagnosed, not fixed. Nothing in this document has been implemented.
> Decision D1 is made (option A, 250 kWh). No decision is open.
>
> **Review record.** Diagnosis: reconstructed blind from primary sources by a fresh Claude session,
> which reached the same two causes. Fix specification: attacked in two rounds by fresh Claude
> sessions (8 blockers, then 7); each is mapped to its resolution in the "Review log" at the end.
> Same vendor, same priors — no external verifier ran. A Gemini cross-check was attempted and
> failed to start (`agy`: 429, credits exhausted).

## Summary

The scheduled `Crawl Energy Prices` workflow has failed on every run since 2026-11-04 (9 runs).
There are **two different failures**, and only the second repeats:

| Date (UTC) | Failing step | Cause |
|---|---|---|
| 2026-11-04 | `Open energy-prices sync PR` | One transient GitHub GraphQL error, no retry. Left PR #175 open without auto-merge. |
| 2026-11-05 → 11-12 (8 runs) | `Crawl energy prices` | EVN published a new tariff (Decision 2892/QD-BCT). The page we scrape no longer contains the residential retail tariff, and the tariff itself went from 6 tiers to 5. The parser matches 0 tiers. |

No repository code change caused this. `git log ef325a5..f1e28d4` (last green → first red) holds
only data commits and their merges: `68aeeb6 chore(energy-prices): daily sync` and
`a06b13d chore(stations): sync VinFast count to 24581` (README + `station-stats.json` only).

**The fail-loud design worked as intended** — the crawl refused to publish and opened #176.
The cost is that production prices have been frozen since 2026-11-03.

## Severity & priority

- Severity: **high**. Priority: **P1**.
- Every price in production is stale, not just EVN: one failed source blocks all three.
  - Gasoline E10 RON 95-III: production `24,150` ₫/L; live on 2026-11-12 `19,840` ₫/L. Production is 21.7% too high.
  - Diesel DO 0,05S: production `30,240` ₫/L; live `26,820` ₫/L. Production is 12.8% too high.
  - Home electricity: production `2,998` ₫/kWh under a tariff that was repealed on 2026-11-01.
- User-visible effect: the trip-cost hero ("Save X vs gasoline") overstates gasoline cost by about 22%, so it overstates EV savings. The copy says "today's prices … Auto-updated daily" (`trip_cost_note`, `src/locales/{en,vi}.json:505`), which is currently false.

## Affected features

- `scripts/crawl-energy-prices.ts`, `src/lib/energy-prices/parse-evn.ts`, `.github/workflows/crawl-energy-prices.yml`
- `src/data/energy-prices.json` (imported at build time by `src/lib/energy-prices/index.ts`).
  The only UI consumer is `src/components/trip/TripSummary.tsx`, through `computeTripCost`
  (`src/lib/trip-cost.ts:130` is the home-charging line).
- README energy block (`src/lib/station-stats.ts:57`, produced by `scripts/update-readme-stats.ts`).
- There is no `HomeEnergyPrices` component in `src/`; `CLAUDE.md:147` lists one in its coverage
  summary, which is stale.

---

## Root cause 1 (the repeating failure): EVN tariff restructure

### What EVN changed

Ministry of Industry and Trade **Decision No. 2892/QD-BCT, dated 2026-10-31, effective 2026-11-01**
replaced the residential retail tariff. EVN rewrote its English tariff pages on 2026-11-04/05.

Three things changed at once. A fix that handles only one of them will produce wrong data.

**1. The URL we scrape now serves a different document.**
`EVN_URL` (`scripts/crawl-energy-prices.ts:44`) is
`https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx`. It still returns HTTP 200
with no redirect, but article id `252` is now titled *"Electricity Selling Prices for Electricity
Retailers (Under Decision No. 2892/QD-BCT …)"*, posted `10:04, 05/11/2026`. That is the
**wholesale price EVN charges resellers**, not what a household pays. (Whether EVN overwrote the
article or re-pointed the id is not known; only the served content was observed.)

**2. The residential retail tariff moved to a new article.**
`https://en.evn.com.vn/d/en-US/news/Retail-Electricity-Tariffs-by-Customer-Categories-Decision-No-2892QD-BCT-dated-October-31-2026-issued-by-Ministry-of-Industry-and-Trade-60-28-501776`
(posted `14:59, 04/11/2026`). The residential table is the last section, under the uppercase
heading `RETAIL ELECTRICITY TARIFFS FOR RESIDENTIAL USE`.

**3. The table changed shape: tier count, boundaries, and every piece of wording.**

| | Old page (Decision 1279/QD-BCT, 2025-05-09) | New page (Decision 2892/QD-BCT) |
|---|---|---|
| Section heading | `RETAIL ELECTRICITY TARIFF FOR RESIDENTIAL USE` (singular) | `RETAIL ELECTRICITY TARIFFS FOR RESIDENTIAL USE` (plural) |
| Row prefix | `Rate N:` | `Tier N:` |
| Range separator | en dash: `0 – 50` | hyphen: `101 - 200` |
| First row | `For the kWh from 0 – 50` | `First 100kWh` |
| Last row | `For the kWh from 401 kWh onwards` | `For the kWh from 701 onwards` |
| Tiers (₫/kWh) | 0–50 `1,984` · 51–100 `2,050` · 101–200 `2,380` · 201–300 `2,998` · 301–400 `3,350` · 401+ `3,460` | 0–100 `1,901` · 101–200 `2,289` · 201–400 `2,894` · 401–700 `3,456` · 701+ `3,844` |

### Why the parser reports "found 0"

`parseEvnTariff` (`src/lib/energy-prices/parse-evn.ts:55-80`) walks a hardcoded `TIER_LABELS`
list (lines 30-41) and **breaks on the first miss** (line 59). The first label is
`For the kWh from 0 – 50`. That string exists on neither new page, so the loop exits with
`tiers.length === 0`, the check at line 69 fails and lines 70-72 throw
`EVN parser: expected 6 residential tiers, found 0`.

`pick()` (`scripts/crawl-energy-prices.ts:141-152`) then reuses the previous EVN value, records
`EVN` in `failedSources`, and line 234 sets `process.exitCode = 1`. A non-zero exit skips every
later step, so the README and PR steps never run.

### The trap: the naive fix publishes wrong prices silently

Confirmed by experiment (both review sessions ran it independently): a copy of the parser patched
with **only** the new label wording, run against the page at the current `EVN_URL`, returns
without throwing:

```
1582 / 1795 / 2236 / 2754 / 3142      ← rural RESELLER wholesale table (page id 252)
1901 / 2289 / 2894 / 3456 / 3844      ← correct household tariff (page id 501776)
```

Every wrong value is 17–23% low and sits inside `ELECTRICITY_VND_PER_KWH_BOUNDS` (`(0, 20000]`,
`plausibility.ts:33`), so the plausibility gate passes, the workflow goes green and the sync PR
auto-merges with no human in the loop. That would turn a loud outage into a quiet permanent error.

The reseller page has 30 `Tier N:` rows and four case-insensitive matches of "residential use".
It has **zero** matches of the exact uppercase heading
`RETAIL ELECTRICITY TARIFFS? FOR RESIDENTIAL USE`. That exact heading is the discriminator.

### Contributing design weaknesses (these turned a data change into a 9-day outage)

The general pattern behind these weaknesses, and the rules that stop the class rather than this one
instance, are in [docs/plans/2026-11-13-upstream-drift-resilience.md](../plans/2026-11-13-upstream-drift-resilience.md).

- **W1 — all-or-nothing sync.** One failed source discards fresh values from the other two
  (`crawl-energy-prices.ts:230-235`). Petrolimex parsed correctly on all 8 runs and was thrown away.
  The intent (never stamp a fresh `lastSyncedAt` onto stale values, see the comment at lines 136-139)
  is right; the granularity is wrong, because `lastSyncedAt` is one field for three sources.
- **W2 — the tariff shape is hardcoded in the parser.** Tier count, kWh boundaries and label
  wording are constants, so any regulator change is a guaranteed outage.
- **W3 — nothing on EVN's site is a stable identity.** EVN reused article id 252 for a different
  document, and it also changed the article title between decisions (`RETAIL ELECTRICITY TARIFF
  (Decision No. 1279…)` → `Retail Electricity Tariffs by Customer Categories (Decision No. 2892…)`).
  Neither id nor title can be trusted. This can be mitigated, not fixed.
- **W4 — the effective date comes from a different page than the prices.** `fetchEvn`
  (lines 97-118) reads prices from the English page and the date from the Vietnamese decisions
  page, with no check that they describe the same decision. On 2026-11-04 the crawl produced
  **old prices stamped `effectiveAt: 2026-10-31`** — that is what PR #175 contains.
- **W5 — nothing downstream notices staleness.** The UI keeps saying "Auto-updated daily".
- **W6 — the failure issue only says "Failed again: <url>".** Nine comments, none with the error
  line, so the cause was not readable from the notification.
- **W7 — the price regex truncates silently.** `([12-9],[0-9]{3})(?!\d)` (`parse-evn.ts:50`): the
  class `[12-9]` is just `[1-9]`, and against `12,345` it matches `2,345` and returns 2345, which
  passes the bound. Not triggered today (all prices are below 10,000) but it is a wrong-value path.

## Root cause 2 (one-off, 2026-11-04): GraphQL error left PR #175 orphaned

Run `41814760049`: the crawl step **succeeded** (EVN had not yet rewritten page 252), the branch
was pushed, `gh pr create` printed `https://github.com/duypham9895/evoyage/pull/175`, and four
seconds later:

```
GraphQL: Something went wrong while executing your query on 2026-11-04T10:32:43Z.
##[error]Process completed with exit code 1.
```

The failing call is one of the two after `gh pr create` in
`.github/workflows/crawl-energy-prices.yml:85-87` (`gh pr list` or `gh pr merge --auto --merge`).
The log does not show which. Neither has a retry. Result: PR #175 has been open since
2026-11-04 with auto-merge **off**, `mergeable: MERGEABLE`, required check green.

It normally self-heals: the next green run force-pushes the branch and re-runs
`gh pr merge --auto`. It did not, because from 11-05 the crawl step fails first.
`crawl-stations.yml:121-123` has the identical unretried sequence.

A second latent defect in the same lines: line 85 uses `--jq '.[0].number'` without the `// ""`
default that line 76 has, so an empty list yields the string `null` and `gh pr merge null` fails.

**Do not merge PR #175 as is.** It carries Petrolimex prices from 11-04 (two price cycles stale)
and the inconsistent EVN record from W4.

---

## Fix specification

Scope is the energy crawl. Follow `ecc:orch-fix-defect`: reproduce as failing tests first.
Steps 0-4 and 6 restore the daily sync and must ship together in one PR. Step 5 is a separate,
larger change and may be a second PR.

### Step 0 — fixtures

Fixture directory: `scripts/__fixtures__/energy-prices/`. The capture helper
`scripts/__fixtures__/energy-prices/capture-fixtures.ts` still hardcodes the old URL at line 76 and
writes it to `evn-tariff.html`; **running it today would overwrite the 6-tier fixture with the
reseller page.**

**Order is load-bearing and the loss is irreversible.** The 1279 residential article no longer
exists anywhere on en.evn.com.vn (checked across all 10 listed articles); the committed
`evn-tariff.html` is the only copy. Do the `git mv` rename **first**, then edit
`capture-fixtures.ts` so it never writes to a positive fixture from article 252, and only then run it.
Update the fixture path at `parse-evn.test.ts:9` in the same commit, or the test file will not load.

| Fixture file | Source | Role |
|---|---|---|
| `evn-tariff.html` (exists — **do not recapture**; rename to `evn-tariff-1279.html`) | old article, Decision 1279 | positive: 6 tiers, singular heading, `Rate N:` rows |
| `evn-tariff-2892.html` (new) | article `501776` (URL above) | positive: 5 tiers |
| `evn-reseller-2892.html` (new) | `https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx` | **negative: must be rejected** |
| `evn-listing.html` (new) | `https://en.evn.com.vn/en-US/news-l/Electricity-Tariff-60-28` | discovery |

### Step 1 — failing tests first (`src/lib/energy-prices/parse-evn.test.ts`)

1. `evn-tariff-2892.html` → exactly `[0–100: 1901, 101–200: 2289, 201–400: 2894, 401–700: 3456, 701–∞: 3844]`.
2. `evn-tariff-1279.html` → still the six tiers `1984/2050/2380/2998/3350/3460` with their ranges.
   Two real pages with different wording are the proof that the parser is generic (W2). Keep the
   existing tests at lines 19-37; they must pass unchanged in meaning.
   Representative tier (see Step 4): with the kWh anchor, the 1279 fixture must still give tier 4
   at `2998` (the existing test at lines 38-41 stays green under D1 option A), and the 2892 fixture
   must give tier 3 at `2894`. Under D1 option B the expected values are tier 6 / `3460` and
   tier 4 / `3456`; update lines 38-41 accordingly.
3. **`evn-reseller-2892.html` → throws, and the error message names the missing residential
   heading.** Assert on the message. A loose anchor would make this test pass for the wrong reason
   (the page has 30 `Tier N:` rows and "For residential use" four times).
4. Non-contiguous tiers, or prices not strictly ascending → throws.
5. A price cell of `12,345` parses as 12345 (then fails or passes the bound on its own merits) —
   regression test for W7.
6. Decision date from the article's `<title>` / `og:title` → `2026-10-31` for the 2892 fixture and
   `2025-05-09` for the 1279 fixture. A date found only in the page body must be ignored: the 2892
   article body also contains `Decision No. 1279/QD-BCT dated 9 May 2025` and
   `Decision No. 1305/QD-EVN dated October 30, 2026` in its sidebar.
7. Discovery (Step 3), tested through two **pure exported functions** in `src/lib/energy-prices/`
   (the crawl script calls `main()` on import and cannot be imported by a test; `vitest.config.ts`
   only includes `src/**/*.test.ts`):
   - `extractEvnTariffArticleUrls(evn-listing.html)` returns absolute URLs and includes the
     `…-60-28-501776` article and the `…-60-28-252` article.
   - `selectEvnResidentialArticle([reseller, 2892, 1279 fixtures])` returns the 2892 article.
     Given only the reseller fixture, it throws.
8. Update the existing test at lines 48-51 ("throws when fewer than 6 tiers"): the rule becomes
   "fewer than 3 tiers throws". Its synthetic HTML has no heading, so it would now throw on the
   anchor and pass for the wrong reason: **add the residential heading to that synthetic HTML** and
   assert the message mentions the tier count.

### Step 2 — parser (`parse-evn.ts`)

- **Anchor.** Find the heading with the case-sensitive regex
  `/RETAIL ELECTRICITY TARIFFS? FOR RESIDENTIAL USE/` and parse only the text after it.
  If it is absent, throw `EVN parser: residential retail tariff heading not found`. Do not fall
  back to a looser match. Counts today: new page 1, old fixture 1, reseller page 0.
  **Ignore an occurrence that sits inside an `<a …>…</a>`**; use the first occurrence that does
  not, and throw the same error if none remains. Link text names another document and never
  introduces a table, and one related-article link carrying the retail article's title is enough
  to make the *reseller* page parse as a complete household tariff: `1582/1795/2236/2754/3142`,
  representative 2,236 ₫ — 22.7% low, contiguous, strictly ascending, inside the plausibility
  bounds, same decision date, every other check passed. The reseller fixture already contains the
  retail article's own slug; a CMS template that renders titles instead of slugs is all it takes.
- **Region.** Parse from the heading to the first `</table>` after it, not to end of file.
- **Rows.** Match the row prefix `(?:Tier|Rate) N:` **case-sensitively** (no `i` flag, unlike the
  current regexes at lines 35-40). The 1279 fixture has a lowercase decoy, `rate 3: From 101 to
  200 kWh for the whole electricity consumption…`, in a paragraph below the table; a
  case-insensitive match picks it up and the parser throws. **Match the label shape first, anchored
  at the start of the row, then read the price only from what follows the label, and require
  exactly one grouped number there — zero or more than one throws.** Taking "the first grouped
  number after the prefix" instead publishes the wrong column the day EVN adds one (a
  VAT-exclusive price, say), silently and plausibly. Reading the boundary as part of the label is
  also what lets a comma-grouped boundary (`701 - 1,000`) parse instead of being eaten as the
  price. Bound each row at its own `</tr>`: the 1279 table continues past the last tier with a
  "prepaid card meter" row that carries its own price.
  Row shape: `<td …><p …><span …>Tier 1: First 100kWh</span></p></td><td …><p …><span …>1,901</span></p></td>`.
- **Whitespace.** Keep the existing `SP` helper (`parse-evn.ts:26-28`) and use it between every
  token of every label regex. The 1279 fixture writes `For the kWh from&nbsp;0 – 50` with a literal
  `&nbsp;` entity; a plain `\s*` does not match it.
- **Labels → ranges.** Supported shapes, all seen on real pages:
  - `First <N>kWh` → `min 0, max N`
  - `For the kWh from <A> [–-] <B>` (en dash or hyphen) → `min A, max B`
  - `For the kWh from <A> [kWh] onwards` (optional `kWh`) → `min A, max null`
  An unrecognised label throws; it must not be skipped.
- Only one combination was verified to parse both real pages: `&nbsp;`-tolerant labels **and**
  case-sensitive rows.
- **Validation.** At least 3 tiers; first `min` is 0; `min[i] === max[i-1] + 1`; last `max` is
  null; prices strictly ascending; `assertPlausibleVnd` on each.
- **Price regex.** Replace line 50 with one that reads the whole number, e.g.
  `/(?<![\d,])(\d{1,3}(?:,\d{3})+)(?![\d,])/`.
- **Plausibility bounds: leave unchanged.** `ELECTRICITY_VND_PER_KWH_BOUNDS` is shared with the
  V-GREEN parser (`parse-vgreen.ts:30`). A tighter EVN floor was considered as a second guard
  against reseller tables and rejected: reseller tier 1 values reach 1,865 against a household
  1,901, so no floor separates them with headroom for a real price cut. The heading anchor is the guard.
- **Decision date.** Add `parseEvnDecisionFromTitle(html)`: read `<title>` or `og:title` only,
  match `Decision No. <n>/QD-BCT dated <date>`, where `<date>` is either `October 31, 2026` or
  `9 May 2025`. Return `{ decisionNo, isoDate }`, or null when the date is not a real calendar date
  (`February 99, 2026`) — an unreal date would be written to `effectiveAt` and would outrank every
  real decision in the Step 3 sort. **Also null when the date is more than 7 days after `now`**
  (an optional parameter defaulting to the current date, so tests are deterministic). MOIT
  publishes a decision days before it takes effect, so a small lead is normal; a mistyped year is
  not, and it is silent — the prices alongside it are still correct, so nothing looks wrong until
  the Step 3 rule 7 floor starts rejecting every real decision that follows, recoverable only by
  hand-editing a committed data file. The current `parseEvnDecisionDate`
  (lines 94-111) cannot do this: its regex needs Vietnamese `Quyết định số …/QĐ-BCT ngày DD/MM/YYYY`
  and returns null on the English article.
- Update the header comment (lines 1-11, including the source URL on line 4) and line 60.

### Step 3 — source discovery (`crawl-energy-prices.ts`)

There is no stable identity on EVN's site (W3), so identify the article **by content**, not by id
or title:

1. Fetch the archive listing `https://en.evn.com.vn/en-US/news-l/Electricity-Tariff-60-28`.
2. `extractEvnTariffArticleUrls(listingHtml)` — pure, in `src/lib/energy-prices/`: collect hrefs
   matching `/d/en-US/news/…-60-28-<digits>` (category 60-28 = Electricity Tariff; 5 of the page's
   29 links today), resolve them against `https://en.evn.com.vn`, dedupe.
3. The script fetches those articles (I/O stays in the script).
4. `selectEvnResidentialArticle(candidates: { url, html }[], now?)` — pure, same module:
   - keep candidates that carry a residential heading of their own (Step 2 Anchor), whose
     `<title>`/`og:title` matches `/retail electricity tariff/i`, where
     `parseEvnDecisionFromTitle` returns a date, **and** where `parseEvnTariff` succeeds;
   - the title test is a **second, independent discriminator**, deliberately not derived from the
     heading. Of the five articles listed in category 60-28 today only the residential ones pass
     it: the reseller ("Electricity Selling Prices for Electricity Retailers"), the wholesale
     ("WHOLESALE ELECTRICITY TARIFF") and the QD-EVN article ("…average retail electricity
     price") all fail. The old 1279 residential fixture passes;
   - pick the latest decision date; on a tie, the highest numeric article id (URL suffix) —
     **but only after checking that the tied candidates publish identical tiers. If they differ,
     throw, naming both URLs.** EVN posted three articles for decision 2892 within hours of each
     other; a second one that gains a residential table (an urban/rural split, a corrected
     re-post) would otherwise publish whichever id happened to be higher, silently;
   - if none qualifies, throw — the EVN source fails loudly, as today.
5. **Never fall back to an older decision.** Compute the newest QD-BCT date found in the `<title>`
   of any candidate that **either carries a residential heading of its own or passes the
   retail-tariff title test** (rule 4's first two tests — either one, not both), parseable or not.
   If the chosen article's decision date is older than that, throw, naming the newer decision
   number and date and saying that no residential tariff parsed for it.

   > Requiring the **heading alone** was wrong in the opposite direction from the "any candidate"
   > wording below. The heading is one case-sensitive literal, and its wording has already changed
   > once in the only two data points that exist (`TARIFF` → `TARIFFS`). A next decision whose
   > article reworded it again — `PRICES`, `HOUSEHOLD USE`, Title Case, a `<span>` inside the
   > phrase — would not be "a newer decision we failed to parse"; it would not be a candidate at
   > all, so it could raise nothing, and the previous decision's article would be republished
   > daily with a fresh `lastSyncedAt`, exit 0, auto-merged. Two independent discriminators
   > already exist; accepting either one for the *raise* means both have to drift before the
   > failure goes silent. Measured against the five articles live on the listing: only the two
   > residential ones satisfy either test, so the kill-switch the "any candidate" wording created
   > stays closed.

   > An earlier draft of this rule said "of *any* candidate, parseable or not". That was wrong and
   > would have been worse than the bug it fixed. Three of the five articles live on this listing
   > — the reseller (252), the MOIT decision announcement (501775) and the wholesale tariff (260)
   > — carry a QD-BCT date in their title and contain no residential table at all. Under the "any
   > candidate" wording, the day any one of them named a decision newer than the residential
   > article's, discovery would throw every day for ever, with no recovery short of a code change.
   > A non-zero crawl exit skips the README and PR steps, so Petrolimex and V-GREEN would freeze
   > too: the nine-day-outage shape of this very report, triggered by an article the parser does
   > not even want. The 2026 event is the proof it is reachable — EVN posted the residential
   > article at 14:59 on 04/11 and the reseller article at 10:04 on 05/11; in the other order the
   > source would have been hard-down for the gap. Gating on the heading keeps the rule's purpose
   > (a residential page whose table stopped parsing still raises the bar) and loses nothing: if
   > no candidate carries the heading, rule 4 already throws, and if only an older residential
   > article parses, rule 7 catches it.

   Rules 1-4 on their own detect a newer decision **only if its table happens to parse** —
   and the 2892 restructure reworded every label on the page, so assuming the next one will parse
   is the assumption that caused this bug. Without this rule the crawl republishes the repealed
   tariff daily with a fresh `lastSyncedAt` and nobody is told.
   Collect `{ url, reason }` for every rejected candidate and put them in **every** error this
   function throws: that message is what the failure issue quotes (W6), and a message with no
   diagnostic content satisfies Step 6's letter and not its purpose.
6. **Every listed article must be fetched successfully**; a failed article fetch fails the EVN
   source. Tolerating one shrinks the candidate set, and a smaller set is exactly how an older
   decision wins rule 5 — a single network blip would be enough. Each EVN fetch carries
   `signal: AbortSignal.timeout(20_000)` and **one retry after a short pause**: discovery needs 6
   fetches where the old `fetchEvn` needed 1 (the Vietnamese decisions page was explicitly
   best-effort), every one of them is now fatal, and one blip would otherwise freeze all three
   sources for the day. A retried fetch is still a fetch that must succeed, so the rule holds.
   If the listing yields more than **10** article URLs, throw rather than truncate — a silently
   truncated candidate set is, again, how an older decision wins. (Measured today: the listing and
   all five articles return HTTP 200 in 0.33-0.68 s.)
7. **Freshness floor against what is already published.** If `previous` exists and the chosen
   article's `effectiveAt` is older than `previous.evnResidential.effectiveAt`, throw. Put the
   comparison in a small pure exported function in `src/lib/energy-prices/`
   (`assertEvnDecisionNotOlderThanPublished`) so it is unit-tested — `scripts/` is outside both
   vitest and `tsc`. This is the only guard against the listing's missing page 2 (see
   "Not verified"): if the current article scrolls off page 1 while an older residential article
   stays, rules 1-5 all pass on the older one.

Verified live on 2026-11-12 by the round-2 reviewer: exactly one of the listed articles qualifies
(`501776`); the reseller article (`252`, 30 `Tier` rows) and the 1279 wholesale article (`260`,
36 `Rate` rows including `Rate 4: For the kWh from 201 – 300`) are both rejected by the anchor.

Why not simply hardcode article `501776` plus the heading anchor: if EVN leaves that article in
place and publishes the next decision as a new article, the crawl would stay green on a repealed
tariff forever. Discovery through the listing is what detects a newer decision.

Also in this step:
- Take `effectiveAt` from the chosen article's title (fixes W4: date and prices now come from one
  document). The field keeps its current meaning — the **decision date** (2026-10-31), not the
  date the tariff takes effect (2026-11-01).
- Write the resolved article URL into `evnResidential.source`.
- Update the comment at line 7 ("6-tier") and the log line at 227 (`evn tier 4:`).
- **Remove the old EVN path completely.** Leaving any one of these is a red `npx tsc --noEmit`
  (a gate in `deploy.yml`; `tsconfig.json` type-checks test files) or a dead reference:

| File | Remove |
|---|---|
| `scripts/crawl-energy-prices.ts:44` | `EVN_URL` (dead once `source` is the resolved URL) |
| `scripts/crawl-energy-prices.ts:45,97-118` | `EVN_DECISIONS_URL` and **all of `fetchEvn`'s use of it**: the two-element `Promise.all` destructuring at line 98 and the `decisionsRes` block at 110-116. `scripts/` is excluded from `tsc`, so a half-removal merges green and throws `TypeError` on the next scheduled run. Rewrite `fetchEvn` as a whole. |
| `scripts/crawl-energy-prices.ts:21` | the `parseEvnDecisionDate` import |
| `scripts/crawl-energy-prices.ts:202-206` | the comment describing the Vietnamese decisions page |
| `src/lib/energy-prices/parse-evn.ts:82-111` | JSDoc, `DECISION_RE` and `parseEvnDecisionDate` |
| `src/lib/energy-prices/parse-evn.test.ts:5` | the `parseEvnDecisionDate` import |
| `src/lib/energy-prices/parse-evn.test.ts:12-15` | the `DECISIONS_FIXTURE` constant |
| `src/lib/energy-prices/parse-evn.test.ts:55-80` | the four Vietnamese decision-date tests |
| `scripts/__fixtures__/energy-prices/evn-decisions-vi.html` | the fixture |

  Tests are deleted here because the code path they cover is removed; Step 1 adds more than four.
  That is within the `CLAUDE.md` rule ("never delete tests unless the feature is removed").

### Step 4 — representative tier (D1 decided: 250 kWh)

`REPRESENTATIVE_TIER = 4` (`parse-evn.ts:43`) meant "201–300 kWh/month". Under the new tariff tier
4 is 401–700 kWh at 3,456 ₫. Keeping the constant silently raises the home-charging price by 15%
and changes what the label means.

A tier **index** is the wrong thing to hardcode: the same index means a different consumption band
in each tariff (tier 3 was 101–200 kWh, now it is 201–400). Replace the constant with a monthly
consumption anchor and derive the tier from the data:

```ts
export const REPRESENTATIVE_MONTHLY_KWH = 250;   // value set by decision D1
// representative tier = the tier t where kWh >= t.minKwh && (t.maxKwh === null || kWh <= t.maxKwh)
```

- **`maxKwh === null` means unbounded above.** The last tier matches any value at or above its
  `minKwh`. A literal `kWh <= t.maxKwh` is false for `null` in JavaScript, so without this rule an
  anchor in the top band finds no tier (`findIndex` → -1 → `tiers[-1]` is `undefined`). D1 option B
  (450 kWh) hits exactly this on the 1279 fixture.
- If no tier matches (cannot happen for a non-negative anchor once the parser's contiguity
  invariant holds), throw; never index with -1.
- Export the constant: `index.test.ts` needs it to assert against the anchor.
- The rendered band for an open-ended tier is `<min>+ kWh/month`, never `<min>–null`.
- Add a Step 1 test with an anchor above the last boundary (e.g. 5000 → last tier on both fixtures).
- The comment on the constant must say what it is under option A: a **continuity anchor** that
  reproduces the previous tier-4 band, not an estimate of household consumption (see D1).

With 250 kWh this gives tier 4 / 2,998 on the 1279 tariff (identical to today) and tier 3 / 2,894
on the 2892 tariff. It keeps working at the next restructure. `representativeTier` and
`representativeVndPerKwh` stay in the JSON with the same meaning, so no **JSON consumer** changes
shape; the README block's in-memory shape does change (table below).

Everything that must change together:

| File | What |
|---|---|
| `src/lib/energy-prices/parse-evn.ts:8-10,43,75-79` | constant → kWh anchor, tier lookup, rationale comment |
| **`src/data/energy-prices.json`** | **must be regenerated in the fix PR** — see below |
| `src/lib/energy-prices/index.test.ts:32-38` | runs against the committed JSON. **Line 34** `toBe(4)` fails with the regenerated file (`expected 3 to be 4`, confirmed by running it): assert instead that the representative tier's band contains the anchor. **Line 36** `tiers[3]` → `tiers[representativeTier - 1]`. Rename the test (it says "tier 4"). Literal fixtures at 55, 71, 93, 109 say `4`; they are schema fixtures and may stay. |
| `src/lib/energy-prices/parse-evn.test.ts:9,38-41` | line 9 (fixture path, Step 0): always. Lines 38-41: **no change under option A** (they stay green); change only under option B, per Step 1 item 2. |
| `src/lib/station-stats.ts:43,57` | `EnergyPricesReadmeBlock` carries only `evnHomeVndPerKwh`; line 57 hardcodes `(EVN tier 4 · 201–300 kWh/month)`. Add the tier number and its kWh band to the block and render from them. |
| `scripts/update-readme-stats.ts:34-40,67-74` | the only producer of that block: its `EnergyPricesFile` type declares only `representativeVndPerKwh`. Read `representativeTier` and `tiers` and pass tier + band. |
| `src/lib/station-stats.test.ts:100-110,131,137-147,161-171` | three literal price objects + the `'EVN tier 4'` assertion |
| `src/locales/en.json:505`, `src/locales/vi.json:505` | `trip_cost_note`: "EVN home tier 4" / "bậc 4". Static copy cannot follow the data; reword without a tier number (e.g. "EVN household rate" / "giá điện sinh hoạt EVN"). Both locales must change together (`locale-keys.test.ts`). |
| `src/lib/trip-cost.test.ts:34,178` | fixture + test name mentioning tier 4 |
| `README.md:18` | generated; regenerate with `npx tsx scripts/update-readme-stats.ts --only=energy` |
| `src/components/trip/TripSummary.tsx:303` | comment quoting "EVN 3,500 ₫/kWh, RON95 23,000 ₫/L" — stale; comment only |
| `CLAUDE.md:147` | coverage list names a `HomeEnergyPrices block` that does not exist |
| `docs/RECOVERY.md:73`, `docs/plans/2026-05-01-fuel-price-implementation.md:96-97,102,199,204` | prose and samples saying "tier 4" / `representativeTier: 4`. No check depends on them; update RECOVERY.md, leave the dated plan as history. |

**Regenerate the data file inside the fix PR.** `index.test.ts` runs against the committed
`src/data/energy-prices.json`, and the required check (`.github/workflows/deploy.yml:74-75`) runs
`npm test`. The JSON is normally written only by the crawl in CI, after merge — so a PR that
changes the representative tier without updating the JSON is red and cannot merge. Run
`npx tsx scripts/crawl-energy-prices.ts` and then `npx tsx scripts/update-readme-stats.ts --only=energy`
locally and commit both outputs. This also ships corrected prices with the fix itself.
The crawl needs no environment variables (no `process.env` in the script, the README script or
`src/lib/energy-prices/*`), only network access.

### Step 5 — per-source sync (fixes W1) — separate PR

> **Superseded if the resilience plan is adopted.** Mechanisms M3 and M4 of
> [docs/plans/2026-11-13-upstream-drift-resilience.md](../plans/2026-11-13-upstream-drift-resilience.md)
> (one data file and one branch per source) replace this step. Implement one or the other, not both.
> This step remains the smaller option if that plan is not taken.

A failed source must not block the others, and must not look fresh.

Data: keep top-level `lastSyncedAt` (`index.test.ts:11` asserts it is a string; nothing renders it)
and add a per-source `syncedAt`. A failed source keeps its previous values and its previous
`syncedAt`.

Workflow mechanics — the order matters, because a non-zero exit skips all later steps and
`continue-on-error` would turn the job green and silence the failure issue:

1. Crawl step (`id: crawl`): exit **0** whenever at least one source is fresh, and write
   `failed_sources=<comma list>` to `$GITHUB_OUTPUT`. Exit non-zero only when no source is fresh.
2. README step and PR step: unchanged, they run because step 1 exited 0.
3. New step after the PR step: `if: steps.crawl.outputs.failed_sources != ''` → print the failed
   sources and `exit 1`. The job ends red.
4. `Open or update failure issue` (`if: failure() && github.event_name == 'schedule'`, line 94)
   stays last and now fires for both partial and total failures.

Today the README and PR steps have no `if:` at all; do not add `if: always()` to them.

Stated consequences of this change, so they are chosen rather than discovered:
- The PR step enables auto-merge **before** the job goes red, and a red job does not cancel
  auto-merge. A partial sync therefore merges fresh Petrolimex/V-GREEN values plus the previous
  EVN values (with EVN's old `syncedAt`) while the run reports failure. That is the intent.
- The comment at `crawl-energy-prices.yml:49-51` ("this step only runs on fresh data") becomes
  false and must be rewritten.
- `src/lib/__tests__/scheduled-workflow-health.test.ts:40-57` asserts that every scheduled
  workflow keeps `issues: write`, the exact `if: failure() && github.event_name == 'schedule'`
  line, `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and `gh issue list` / `comment` / `create`.
  Steps 5 and 6 keep all of them; do not restructure the failure step in a way that drops one.

### Step 6 — workflow hardening (root cause 2, W6)

In `crawl-energy-prices.yml:76-87` and the identical block in `crawl-stations.yml:112-123`:
- Capture the PR URL that `gh pr create` prints and use it for the merge call, instead of a second
  `gh pr list` (removes one of the two calls that can fail, and the `null` bug on line 85).
- Retry `gh pr merge --auto --merge` (3 attempts, short backoff).
- In the failure-issue step, include the failing error line in the comment, not only the run URL.

### Step 7 — recover production state

1. Merge the fix PR (it already carries regenerated data, see Step 4).
2. **Close PR #175 as superseded and delete the `automation/energy-prices` branch.** Do not rely
   on the next run to clean it up: if that run fails, a MERGEABLE PR carrying 11-04 prices and the
   inconsistent EVN record stays open against a corrected `main`.
3. Run the workflow manually (`workflow_dispatch`). The `crawl-energy-prices` concurrency group
   queues it behind any scheduled run; it cannot race. The crawl rewrites `lastSyncedAt` on every
   run, so there is always a diff: expect a new sync PR that auto-merges.
4. Close #176 with the run link.

## Pre-production test gates

Every gate below runs under `npm test` or `npx tsc`, which the required check
(`Deploy to Vercel`, `deploy.yml`) runs on every PR — including the automation's own daily data PR.
That is the point: the sync PR auto-merges with no human in the loop, so these are the last thing
between a bad value and production. Four review rounds found eleven ways to publish a plausible
wrong number; none of them had a test until now.

| Gate | Where | What it blocks |
|---|---|---|
| **G1 — named regression catalogue** | `src/lib/energy-prices/parse-evn.test.ts` | Every silent-wrong, silent-stale and permanent-break path found in rounds 1-3, each named after its review id (`R1-H1`, `R1-M2/M3`, `R2-S1/S2/S3`, `R2-N3`, `S3-1`, `W7`, `SPEC-TRAP`). A fix that reopens one of them fails a test that names it. |
| **G2 — crawl end-to-end, offline** | `src/lib/__tests__/crawl-energy-prices.test.ts` | The script's own control flow, which had no gate at all (`main()` runs on import, `scripts/` is outside vitest *and* outside `tsc`). Drives the real script with `fetch` and `node:fs` mocked: happy path, a twice-failing article fetch, a listing with only the reseller article, the freshness floor, a Petrolimex feed missing its product, and the no-previous-file FATAL path. |
| **G3 — data contract** | `src/lib/__tests__/energy-prices-data-contract.test.ts` | A malformed or implausible `src/data/energy-prices.json` auto-merging. Runs the parser's **own** exported `assertTariffShape` and `findRepresentativeTier` against the committed file, plus date, host and fuel-product checks. Each rule has a paired test that corrupts an in-memory copy, so the gate is proven able to fail. |
| **G4 — workflow behaviour** | `src/lib/__tests__/crawl-workflow-steps.test.ts`, `scheduled-workflow-health.test.ts`, `deploy-quality-gates.test.ts` | (a) The seven PR-step traces that were previously only ever run by hand: the real `run:` text is extracted from the YAML and executed under `bash -e` with stub `gh`/`git`/`sleep`/`node`. (b) The failure-issue step against a hostile `crawl.log`. (c) The four controls that were enforced only by comments — `pipefail` in both piping steps, the empty-`$pr` guard, the redaction `sed`, the narrow grep. (d) A `tsconfig.scripts.json` type-check (`npm run typecheck:scripts`), wired into `deploy.yml`, because `tsconfig.json` excludes `scripts/`. |
| **G5 — dry run on a real runner** | `crawl-energy-prices.yml` `workflow_dispatch` input `dry_run` | The one thing no offline gate can cover: the real crawl against live EVN and Petrolimex on an Actions runner. Crawls and syncs the README exactly as normal, prints `git diff --stat` and the EVN block to the step summary, and skips the PR step. Default false; scheduled runs are unaffected. |

Known gaps are recorded as `it.fails` in the catalogue rather than left unsaid: a newer residential
article whose title date `DECISION_RE` cannot parse, and one whose title names no decision at all,
are both still silently ignored (`R3-1`). The two real titles EVN has published already use two
different date formats, so a third is not an exotic hypothesis.

## Acceptance criteria

- `npm test`, `npx tsc --noEmit` and `npx next build` green. `npm test` includes: both positive
  fixtures, the reseller-page rejection asserting on the heading error, the `12,345` regex test,
  and the two discovery functions.
- `src/data/energy-prices.json` in the fix PR has 5 EVN tiers `1901/2289/2894/3456/3844`,
  `effectiveAt: "2026-10-31"`, `source` pointing at article `501776`, and Petrolimex equal to the
  live value on the day of the run.
- A manual run of the workflow is green.
- `grep -rn --exclude-dir=__fixtures__ "201–300\|6-tier\|RETAIL-ELECTRICITY-TARIFF-9-28-252" src scripts README.md`
  returns nothing. (`capture-fixtures.ts` lives in `__fixtures__` and legitimately keeps the
  article-252 URL to capture the negative fixture.)
- `capture-fixtures.ts` no longer writes article 252 into a positive fixture.

## Decision D1 (owner: Duy) — what monthly consumption represents "home charging"?

> **Decided 2026-11-12 — Duy chose option A: `REPRESENTATIVE_MONTHLY_KWH = 250`.**
> Step 4 is unblocked. The options are kept below as the record of what was weighed.

The value of `REPRESENTATIVE_MONTHLY_KWH` (Step 4). The representative tier is whichever tier
contains it.

| Option | Lands in (new tariff) | Home price | Effect vs today's 2,998 | On the old tariff it would have been |
|---|---|---|---|---|
| A: 250 kWh | tier 3 (201–400) | 2,894 ₫ | −3.5% | tier 4 / 2,998 — exactly today's behaviour |
| B: 450 kWh | tier 4 (401–700) | 3,456 ₫ | +15.3% | tier 6 / 3,460 |

Recommendation: **A**. It reproduces today's behaviour exactly on the old tariff, so the change is
"follow the new tariff", not "change the product assumption". Strongest case against: the documented
rationale (`parse-evn.ts:8-10`, "the car adds 150–300 kWh/month on top of normal household use")
implies a monthly total of roughly 350–500 kWh, which straddles the 400 kWh boundary — A may
understate cost for heavier households, and B never understates it. A blended rate (averaging tiers
3 and 4, about 3,175 ₫) was considered and dropped: it needs a consumption model nobody has stated.
If wrong: one constant, reversible in a one-line PR; the daily sync republishes the next day.

Stated plainly, because the constant's name invites the wrong reading: **250 kWh is not a
believable monthly total for a household that also charges a car** (the old rationale itself adds
150–300 kWh of charging on top of household use). Option A is a continuity choice — "keep showing
the band we showed before" — and the code comment must say so. Option B is the honest consumption
estimate and costs a visible +15% on the home-charging line.

## Not verified

- Which of the two `gh` calls raised the GraphQL error on 2026-11-04 (the log does not say), and
  whether that error is truly one-off: no run since has reached the PR step.
- Whether EVN's next decision will keep the residential heading wording. It changed once already
  (`TARIFF` → `TARIFFS`); the regex tolerates that one variation only.
- Whether the archive listing URL is stable and newest-first. Observed once, on 2026-11-12.
- **The listing has no page 2 that a crawler can fetch.** Its "More" control is a
  `javascript:__doPostBack(...)` postback. If EVN publishes enough newer tariff-category articles
  to push the residential article off page 1, discovery cannot see it. Rules 1-4 alone fail loudly
  only when *nothing* qualifies; with an older residential article still listed they would have
  selected it silently, publishing a repealed tariff with `effectiveAt` moving backwards. Step 3
  rule 7 (the freshness floor) is what makes that case loud. It stays loud until someone
  intervenes — a known ceiling of this design, now with no silent variant.
- **Two deliberate false-negative paths in discovery.** (a) An article that parses but whose title
  has no `QD-BCT` decision string is excluded. (b) The link filter hardcodes category id `60-28`.
  If EVN changes either, the EVN source fails loudly on a page it could have parsed.
- Whether `deploy.yml` is what branch protection requires was read from the API earlier in this
  investigation (required context: `Deploy to Vercel`); the Step 5 job semantics were reasoned
  from documented Actions behaviour, not from a run.
- The rendered production UI. The stale values are inferred from the build-time JSON import, not
  observed in a browser; the numbers are rendered client-side after a route is planned.
- Why runs start about 7.5 hours late (cron `0 3 * * *` = 10:00 ICT; runs land near 10:30 UTC and
  have drifted later since August). The cron comment is correct; the scheduling delay is unexplained.
- Whether a Vietnamese residential article exists (not needed for this fix).
- The fix is unimplemented, so "the fix PR would be red without the JSON" is predicted from the
  assertions in `index.test.ts`, not from a red run.

## Evidence

- Failing run log, 2026-11-12: `gh run view 43202641503 --log-failed`
- First failure, 2026-11-04: `gh run view 41814760049 --log`
- Run history: `gh run list --workflow crawl-energy-prices.yml --limit 100` (green through 2026-11-03)
- Live fetches of all EVN pages above and of the Petrolimex API, 2026-11-12, HTTP 200.
- Heading / row-prefix counts (`grep -oE … | wc -l`): reseller page 0 headings, 30 `Tier N:`;
  new article 1 heading, 5 `Tier N:`; old fixture 1 heading, 6 `Rate N:`.
- The round-2 reviewer's throwaway prototype of the Step 2 parser (`parser.mjs`) and its
  discovery run (`discover.mjs`) were written to a session scratch directory and are not kept.
  They are not a reference implementation; the fixtures and the tests in Step 1 are the contract.

## Review log

Blockers raised against the first draft of the fix specification, and where each is resolved:

| # | Blocker | Resolved in |
|---|---|---|
| B1 | Anchor and row prefix as first written did not match the old fixture the spec said to keep (`TARIFF` vs `TARIFFS`, `Rate` vs `Tier`, en dash, `401 kWh onwards`) | Step 2 anchor regex and label shapes; Step 1 item 2 |
| B2 | `energy-prices.json` missing from the change list although `index.test.ts` gates the required check | Step 4, "Regenerate the data file" |
| B3 | "Take the date from the same article" had no implementation path; body text has decoy decisions | Step 2 `parseEvnDecisionFromTitle`; Step 1 item 6 |
| B4 | Per-source sync as written could not work in Actions and would silence the failure issue | Step 5 workflow mechanics |
| B5 | Discovery by title is as brittle as the article id; no tie-break | Step 3 content-based discovery; W3 reworded as "mitigated" |
| B6 | `capture-fixtures.ts:76` would overwrite the kept fixture with the reseller page | Step 0 |
| B7 | "Derive the band text" was not implementable with the listed files | Step 4 rows for `station-stats.ts:43` and `update-readme-stats.ts` |
| B8 | Cited a `HomeEnergyPrices` component that does not exist | Affected features; Step 4 row for `CLAUDE.md:147` |

Round 2 (a third fresh Claude session, which built the Step 2 parser as specified and ran it on
all pages, ran the affected tests, and ran discovery live against the listing):

| # | Blocker | Resolved in |
|---|---|---|
| R2-1 | Label shapes did not allow the `&nbsp;` entity the 1279 fixture uses | Step 2 "Whitespace" |
| R2-2 | Row-prefix case sensitivity unspecified; lowercase decoy row in the 1279 fixture; no end bound | Step 2 "Region" and "Rows" |
| R2-3 | `index.test.ts:34` `toBe(4)` not in the change list; red under the recommended option | Step 4 table |
| R2-4 | `parse-evn.test.ts:38-41` in no change list; one tier index cannot mean the same band in two tariffs | Step 4 kWh anchor; Step 1 item 2 |
| R2-5 | Discovery test had no implementable home (script runs `main()` on import) | Step 3 pure functions; Step 1 item 7 |
| R2-6 | Acceptance grep could never return empty | Acceptance criteria; `EVN_URL` in Step 3 removal table |
| R2-7 | Removal list incomplete; a leftover import is a red `tsc` | Step 3 removal table |

Round 3 (same reviewer session; final round of the budget): R2-1 to R2-7 all confirmed resolved,
the two discovery functions implemented as specified and verified against the live listing
(5 links, selects `501776`), the acceptance grep confirmed satisfiable, D1 arithmetic confirmed.
It raised **one new blocker**:

| # | Blocker | Resolved in |
|---|---|---|
| R3-1 | The kWh-anchor lookup had no rule for the open-ended last tier (`maxKwh === null`); D1 option B lands on it and a literal implementation returns no tier | Step 4, "`maxKwh === null` means unbounded above" |

**The R3-1 fix and the round-3 nonblocking edits have not been re-reviewed.** The review budget
(three rounds) is spent. The fix applied is the one the reviewer prescribed, verbatim in substance.

Round 4 — **implementation** review (four fresh Claude sessions against the working tree: code
quality, TypeScript, security, spec conformance; same vendor, same priors, no external verifier).
Three of the four returned BLOCKING: 1, and all four independently found the same discovery gap.

| # | Blocker | Resolved in |
|---|---|---|
| R4-A | Discovery falls back to an older decision when the newest article does not parse or is not fetched, and the regression is invisible: rejection reasons are discarded, an unreal title date outranks every real one, and nothing compares the winner against what is already published | Step 3 rules 5-7; Step 2 "Decision date" (null on an unreal date) |
| R4-B | The price is "the first grouped number after the label", not a cell: an extra column (VAT-exclusive) publishes the wrong number silently, and a comma-grouped kWh boundary is eaten as the price | Step 2 "Rows" |
| R4-C | `pr=$(gh pr create … \| tail -1)` runs without `pipefail`, so a failed create yields an empty `$pr`, three `gh pr merge ""` attempts and an error naming the wrong command | Step 6 (both workflows): `set -o pipefail`, fail fast on a failed create or an empty URL |
| R4-D | The failure-issue quote is unmasked by construction (`tee` bypasses the runner's secret masking) and is posted to a **public** repo; the narrow grep that keeps upstream-controlled text inside the code fence was incidental, not documented | Step 6: redact connection strings and cap line length, both applied to the log lines only and never to the run URL; label the quote as possibly predating the failure; the grep pattern is commented as a security control |

R4-A and R4-B were the two paths that could still publish a plausible wrong number with nobody in
the loop — the failure class this document exists to close.

Round 5 — **implementation** review 2 (security and spec-conformance lenses, fresh sessions, same
vendor and priors). Both confirmed R4-A to R4-D fixed: the PR step is safe in all seven traced
branches, `gh pr merge ""` is unreachable, the older-decision fallback throws with its reasons
attached, the comma boundary parses and the two-numbers-in-a-cell case is loud. Both then found
that **the Round 4 fix for R4-A overshot**, and they found it independently.

| # | Blocker | Resolved in |
|---|---|---|
| R5-1 | The newest-decision rule counted *any* candidate's title date, handing three live non-residential articles a permanent kill switch over the whole crawl — Petrolimex and V-GREEN included | Step 3 rule 5, gated on the residential heading, with the earlier wording quoted and explained |
| R5-2 | The heading anchor matched link text, so one related-article link makes the **reseller price list** parse as a household tariff (2,236 ₫, 22.7% low, every other check green); and the article's own title was an unused second discriminator | Step 2 "Anchor" (ignore in-link occurrences); Step 3 rule 4 (`/retail electricity tariff/i` on the title) |
| R5-3 | No upper bound on a decision date: a mistyped year writes a far-future `effectiveAt` and the rule 7 floor then rejects every real decision for ever | Step 2 "Decision date" (null beyond 7 days ahead, `now` injectable) |
| R5-4 | Tied decision dates were resolved by article id with no check that the tied articles agree on price | Step 3 rule 4 (throw, naming both URLs, when tied tiers differ) |
| R5-5 | The R4-D redaction ate every `https://` URL, deleting the per-candidate diagnostics R4-A had just added | Step 6: redact only `postgres(ql)://` and URLs with embedded credentials |
| R5-6 | 6 fatal fetches with no retry, and no cap on the candidate fan-out | Step 3 rule 6 |

R5-1 is worth recording as a process note, not just a defect: the rule it corrects was written into
this document by the session that implemented it, so round 4's acceptance bar moved with the code
and rules 5-7 shipped unreviewed. The next reviewer should treat Steps 2-3 as implementation-derived
rather than independent.

Round 6 — **implementation** review 3 (security and spec-conformance, fresh sessions, same vendor
and priors). Both confirmed every round-5 finding fixed: the in-link heading skip kills the reseller
decoy, the four live non-residential articles can no longer veto the crawl, the lead bound holds at
the day boundary in both directions, the narrowed redaction keeps the EVN URL readable, and
`gh pr merge ""` is unreachable across all seven traced branches. Both then found that the round-5
fix for R5-1 had closed the bar on the wrong key.

| # | Blocker | Resolved in |
|---|---|---|
| R6-1 | Gating the newest-decision bar on the heading **alone** made the next decision's article vanish silently if EVN reworded that literal — the same republish-the-repealed-tariff failure, one rewording away. Reproduced from the real 2892 fixture: `TARIFFS`→`PRICES` and Title Case both published the old article, exit 0 | Step 3 rule 5, raised on heading **or** retail-tariff title |

The R6-1 line was applied **without a seventh review round** — a deliberate owner decision. In its
place the owner required the automated pre-production gates above, so that this class of defect is
caught by the required check rather than by another reading. Two narrower variants of R6-1 (the
title's *decision phrase* itself drifting) are **not** fixed and are recorded as `it.fails` in G1.

> Review provenance, stated once for the whole document: every round was a fresh session of the
> same model that wrote the change. Same vendor, same priors — no external verifier ran at any
> point, and the one Gemini cross-check attempted in round 0 failed to start.

Round-2 experiments that confirmed the spec: the Step 2 parser returns exactly the expected tiers
on both real pages and rejects the reseller page and the listing; the suggested price regex picks
the right cell on all 11 rows and cannot match label numbers or dates; the 1279 fixture satisfies
every validation rule; both decision-date formats exist in `<title>`/`og:title`; the Step 5 step
ordering is valid Actions semantics; `gh pr create` prints the PR URL on stdout.
