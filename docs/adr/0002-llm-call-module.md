# Deepened LLM call Module owns provider chain, response cleaning, and error classification

Decided 2026-05-06 during architectural review (`/improve-codebase-architecture`).

## Context

evoyage's LLM use today (`callJsonLLM` in `src/lib/evi/llm-call.ts`) provides two callers — `parseTrip` and `generateSuggestions` — with a hardcoded MiMo Flash → Minimax M2.7 fallback chain, a `<think>`-tag stripper, a markdown-fence stripper (workaround for M2.7 wrapping JSON in ` ```json ` fences despite `response_format: json_object`), and an infrastructure-vs-schema error classification. Both callers re-import these concerns and construct their own schemas, token budgets, and timeout postures. The M2.7 markdown workaround is documented inline; the MiMo→Minimax chain is hardcoded; telemetry is ad-hoc.

## Decision

Replace `callJsonLLM` with a deepened LLM call Module. Caller passes `{ schema, system, user, maxTokens?, timeoutMs?, signal? }`. Module owns:

- Provider chain (MiMo→Minimax, invisible to callers — telemetry as side-channel only)
- Response cleaning (`<think>` tags, markdown fences, future provider-quirks)
- Schema validation via `.safeParse()`
- Throws typed errors: `LLMUnavailableError`, `LLMSchemaError`, `LLMAbortedError`

`messages` array assembly stays internal. `temperature`, `top_p`, `response_format` are Module-internal with no override surface. Telemetry (which provider answered, latency, token count) emits to logger, not return value.

## Why

The M2.7 markdown-fence workaround is currently inline-documented but caller-visible — that knowledge belongs at the Seam, not in the Implementation. Two callers using identical fallback policy is "two adapters = real Seam"; today the Seam leaks. Concentrating provider-quirk knowledge in one place is the **Locality** win.

## Considered alternatives

- **Caller-controllable provider chain** (e.g. `providers?: 'minimax-only' | 'all'`). Rejected: no caller has a real reason to disable fallback today. Karpathy Rule 2 — add when a real caller appears.
- **Result discriminated union instead of throws.** Rejected: both current callers are wrapped in route-handler `try/catch` for HTTP error mapping; switching to Result requires a TS Result library (`neverthrow` or similar) and refactors with no functional gain. Typed errors give the same error-classification Locality with less ceremony.
- **Caller passes `messages` array.** Rejected: leaks model-shape knowledge across the Seam. `{ system, user }` strings keep callers ignorant of how providers want messages formatted.

## Consequences

- The `EviTripExtractor` Module (ADR-0005) consumes this Module rather than re-implementing provider orchestration.
- If a future caller needs multi-turn chat (not single-shot schema-validated extraction), build a separate Module for that — different Interface shape.
- Telemetry shape is the operational interface for this Module — keep it stable across implementation changes; future dashboards/alerts may key off provider-name tags.
