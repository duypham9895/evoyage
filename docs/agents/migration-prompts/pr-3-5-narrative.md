# PR 3.5 — Migrate narrative route caller to `llm-module.ts`

PR 3/4 (generateSuggestions) shipped as a split, not bundled. PR 4/4 (delete `llm-call.ts`) cannot land until this caller migrates. Paste the block below into a fresh Claude Code session at the evoyage repo root.

---

```
/tdd

Migrate src/app/api/route/narrative/route.ts → use src/lib/evi/llm-module.ts (callLLM)
instead of src/lib/evi/llm-call.ts (callJsonLLM). PR 2 (parseTrip) and PR 3 (suggestions)
are the canonical examples.

Read these first:
- docs/adr/0002-llm-call-module.md — the locked Interface contract
- src/lib/evi/llm-module.ts — the new Module
- src/lib/evi/minimax-client.ts — PR 2's parseTrip migration (commit e92cb42)
- src/lib/evi/suggestions-client.ts — PR 3's generateSuggestions migration
- src/app/api/route/narrative/route.ts — what you're migrating
- src/app/api/route/narrative/route.test.ts — existing tests, mock pattern to update
- The "Known behavior gaps" section of git log -1 --grep="PR 1/4"

What's different from PR 3 (don't blindly copy):
1. **Route handler, not pure function.** The catch block maps LLM errors to HTTP
   status codes (currently 500 generic / 503 when "Both providers failed"). After
   migration:
   - LLMUnavailableError → 503 + {error: 'AI service unavailable'}
   - LLMSchemaError → 500 + {error: 'Failed to generate route narrative'}
     (was: thrown manually from `if (!result.success)` post-call safeParse)
   - LLMAbortedError → 500 (or pick a new status — decide and document)
   - Any other Error → 500 generic
   Use `instanceof` checks instead of the current `/Both providers failed/i.test(message)`
   regex — that's the real cleanup win here.

2. **Timeout collapse decision (REAL semantic change).** Original code has
   `primaryTimeoutMs=15_000`, `fallbackTimeoutMs=50_000`. The new Module accepts
   ONE `timeoutMs` applied per provider attempt. Options:
     - `timeoutMs: 15_000` — kills MiMo fast (preserved), but tightens M2.7 from 50s → 15s.
       Risk: M2.7 reasoning chain on long route narratives may not finish in 15s.
     - `timeoutMs: 50_000` — gives M2.7 its room, but lets MiMo hang up to 50s before
       fallback. Risk: bad primary-path latency budget.
     - `timeoutMs: 30_000` — middle. No precedent in the data.
   The endpoint has `maxDuration = 70` (Vercel platform cap), so 50_000 × 2 = 100s
   exceeds the budget. **Recommended: timeoutMs: 30_000** — fits 2 attempts inside
   60s with 10s headroom. State the choice + reasoning in the commit.

3. **Schema lives in the Module now.** Drop the post-call
   `narrativeResponseSchema.safeParse(json)` — pass `narrativeResponseSchema` to
   callLLM as the `schema` field. The callLLM<T> generic infers the result type.

4. **userMessages → user.** The original passes the prompt as a `user` message
   (with a generic system prompt). Map the original `systemPrompt` → `system`,
   the original `userMessages[0].content` (which holds buildNarrativePrompt(data))
   → `user`.

5. **maxTokens=4096.** Preserve — narratives are long.

Drop:
- callerTag ('narrative') — telemetry is side-channel inside the Module
- temperature=0.4 — Module-internal
- The post-call narrativeResponseSchema.safeParse — moves into callLLM
- The `if (provider === 'minimax') console.warn(...)` block — provider info
  no longer surfaces; telemetry is logger-only inside the Module
- The `if (/Both providers failed/i.test(message))` regex — replace with
  `if (err instanceof LLMUnavailableError)`

TDD discipline:
- Update src/app/api/route/narrative/route.test.ts mock target: `@/lib/evi/llm-call` → `@/lib/evi/llm-module`. Mock fixture shape: `{json: AI_RESPONSE, provider: 'mimo'}` → just `AI_RESPONSE`.
- Existing tests must pass after migration. Specifically:
  - "returns 503 when both LLM providers fail" — change mock from `mockRejectedValueOnce(new Error('Both providers failed...'))` to `mockRejectedValueOnce(new LLMUnavailableError('All LLM providers exhausted'))`.
  - "returns 500 when AI response is missing required fields (schema fails)" — change mock from `mockResolvedValueOnce({json: {overview: 'ok'}, ...})` (which used to land in route's safeParse) to `mockRejectedValueOnce(new LLMSchemaError('missing fields', '{"overview":"ok"}'))` (because schema validation now happens INSIDE callLLM).
  - "returns 500 when callJsonLLM throws a generic error" — keep, but rename to "callLLM throws a non-typed Error" for accuracy.
  - "passes correct temperature, maxTokens, callerTag" — REWRITE to assert the new shape: `expect.objectContaining({ schema: ..., system: ..., maxTokens: 4096, timeoutMs: 30_000 })`. Drop temperature, callerTag, primaryTimeoutMs, fallbackTimeoutMs.
- Add at least one new test: LLMAbortedError → 500 (or whichever status you decided).
- One test → one impl change → repeat.
- Don't touch llm-call.ts. That's PR 4/4.
- Don't touch parseTrip or generateSuggestions — already migrated.

Success criteria:
- route.ts imports callLLM, LLMUnavailableError, LLMSchemaError, LLMAbortedError from '@/lib/evi/llm-module' (not callJsonLLM from llm-call)
- All narrative route tests pass with the new mock shape
- Full vitest suite green (1199+ baseline — count grows or stays the same)
- npx tsc --noEmit clean
- Commit as: feat(evi): migrate narrative caller to deepened LLM module (PR 3.5/4)

After this lands, PR 4/4 unblocks: delete src/lib/evi/llm-call.ts + llm-call.test.ts.
Re-check src/lib/evi/llm-providers.ts — if PRIMARY_PROVIDER/FALLBACK_PROVIDER aliases
are unused after llm-call.ts deletion, drop them too.
```
