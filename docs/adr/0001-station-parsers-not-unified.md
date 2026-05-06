# Station parsers stay separate per source

Decided 2026-05-06 during architectural review (`/improve-codebase-architecture`).

## Context

evoyage has four station-data parsers that produce structurally similar `ParsedStation`-shaped objects:

- `src/lib/stations/parse-osm.ts` — used by `scripts/seed-osm-stations.ts`
- `src/lib/stations/parse-evpower.ts` — used by `scripts/crawl-evpower-stations.ts`
- `src/lib/stations/parse-manual-csv.ts` — used by `scripts/seed-manual-stations.ts`
- `src/lib/stations/dedup.ts` + `trust-signal.ts` — utilities used by the above plus `scripts/promote-crowdsourced-stations.ts` and `src/components/trip/StationTrustChip.tsx`

A natural-looking refactor is "unify these behind one pipeline Module that owns parse → dedup → trust-score." Architectural reviews will keep proposing this because the schema overlap is visually striking.

## Decision

The parsers stay separate. No unifying pipeline Module.

## Why

Schema overlap is not orchestration overlap. Each parser has exactly **one** production caller, and the four callers don't compose:

- They run in **separate processes** on **different cadences** (one-time backfill, periodic cron, manual import, event-driven promotion).
- Each script wraps its parser in source-specific concerns (Overpass query, HTML scraping, file reading, DB query) that dwarf the parsing step itself.
- The output shape is *already* unified — it's the Prisma `Station` table. That consolidation lives in the schema, not in a Module.

Applying the **deletion test**: deleting a hypothetical pipeline Module before it exists doesn't cause complexity to reappear across N callers. There is no shared orchestration to concentrate. Per Karpathy Rule 2, building it would be speculative consolidation.

Applying the **two-adapters rule**: four parsers each used by exactly one script is four hypothetical seams, not real ones.

## Considered alternatives

- **`StationDataPipeline` Module owning parse → dedup → trust-score.** Rejected: see "Why" above. The Module would be a function-call wrapper with no Locality gain — each script would still need its own source-specific pre-processing wrapper around it.

## Consequences

The `trust-signal.ts` runtime caller (`StationTrustChip.tsx` via `classifyTrustSignal`) is a *classifier*, not a parser. It already has one well-shaped Interface. Don't fold it into a hypothetical pipeline Module.

A *different* deepening candidate may exist in this area: a **`StationUpserter` Module** that owns idempotent DB upsertion across the four scripts (matching by source IDs / coords-near, conflict resolution between sources, trust-signal merge on update). Idempotency logic is the kind of thing that *would* duplicate across the scripts and earn its keep when concentrated. Worth a dedicated walk of the four scripts before proposing — propose-then-walk is the wrong order for this candidate too.

## Re-evaluation triggers

Reopen this decision if:

- A **runtime** caller emerges that needs to parse stations from multiple sources synchronously (unlikely — runtime serves pre-parsed data from DB).
- A fifth source is added and copy-paste between scripts crosses a real threshold (currently each script is independent enough that this hasn't happened).
- The Prisma schema's role as the unifying contract breaks down (e.g. sources start producing fields that don't map cleanly to `Station`).
