# PR 2/4 — Migrate `parseTrip` to use `llm-module.ts`

Paste the block below into a fresh Claude Code session started from the evoyage repo root. The new session inherits all project files, CLAUDE.md, ADRs, and installed skills automatically — it just doesn't carry the conversation transcript from PR 1.

---

```
/tdd

Migrate src/lib/evi/parseTrip → use src/lib/evi/llm-module.ts (callLLM)
instead of src/lib/evi/llm-call.ts (callJsonLLM).

Read these first:
- docs/adr/0002-llm-call-module.md — the locked Interface contract
- src/lib/evi/llm-module.ts — the new Module (PR 1/4, commit 334ecdf)
- src/lib/evi/llm-module.test.ts — mock pattern to copy in parseTrip's tests
- The "Known behavior gaps" section of git log -1 --grep="PR 1/4" — these
  are the migration risk areas

Mechanical scope:
1. parseTrip currently calls callJsonLLM with { systemPrompt, userMessages,
   maxTokens, temperature, primaryTimeoutMs, fallbackTimeoutMs, callerTag }.
   Adapt to callLLM's { schema, system, user, maxTokens?, timeoutMs?,
   signal? } — schema goes INTO the call, no more external Zod parsing.
2. userMessages is currently an array; new Module takes a single `user`
   string. If parseTrip passes multi-turn conversation, concatenate or
   reshape — but check this is actually used (might be single-turn).
3. parseTrip's existing tests must all pass after migration. Update mock
   imports if needed.
4. callerTag is gone (telemetry is side-channel inside the Module). Drop it.
5. Two timeouts → one. If existing primary/fallback timeouts differ, pick
   the smaller one (or noted larger one if there's a real reason).

TDD discipline:
- One test → one impl change → repeat.
- If a real test exposes a behavior gap from the PR-1 list (network error
  patterns, empty content fallback, missing API key, mid-call signal
  linking), add a failing test for it FIRST, then fix in llm-module.ts
  before continuing the migration.
- Don't touch llm-call.ts. That's PR 4/4 (deletion after both callers
  migrate).
- Don't touch generateSuggestions. That's PR 3/4.

Success criteria:
- parseTrip imports callLLM from './llm-module' (not callJsonLLM)
- All parseTrip tests pass (existing + any new gap-exposing tests)
- Full vitest suite green
- npx tsc --noEmit clean
- Commit as: feat(evi): migrate parseTrip to deepened LLM module (PR 2/4)
```

---

## After PR 2 lands

Use `pr-3-generateSuggestions.md` (mirror of this prompt with names swapped). The pattern stabilizes once the first migration lands — PR 3 should be faster.
