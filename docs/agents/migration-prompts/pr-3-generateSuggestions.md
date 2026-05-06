# PR 3/4 — Migrate `generateSuggestions` to use `llm-module.ts`

Paste the block below into a fresh Claude Code session started from the evoyage repo root. The new session inherits all project files, CLAUDE.md, ADRs, and installed skills automatically — it just doesn't carry the conversation transcript from PR 1 or PR 2.

---

```
/tdd

Migrate src/lib/evi/suggestions-client.ts (generateSuggestions) → use
src/lib/evi/llm-module.ts (callLLM) instead of src/lib/evi/llm-call.ts
(callJsonLLM). PR 2 already migrated parseTrip — copy that pattern.

Read these first:
- docs/adr/0002-llm-call-module.md — the locked Interface contract
- src/lib/evi/llm-module.ts — the new Module
- src/lib/evi/minimax-client.ts — PR 2's migrated parseTrip (commit
  e92cb42), the canonical example to mirror
- src/lib/evi/minimax-client.test.ts — PR 2's mock pattern to copy
- The "Known behavior gaps" section of git log -1 --grep="PR 1/4"
  — these are the migration risk areas

What's different from PR 2 (don't blindly copy):
1. The Zod schema (`SuggestionsSchema`) is defined INLINE in
   suggestions-client.ts, not imported from types.ts. Pass it inline
   to callLLM — don't extract to types.ts (out of scope).
2. generateSuggestions intentionally SWALLOWS all errors and returns
   []. This is by design ("chips are nice-to-have"). The outer
   try/catch must catch LLMSchemaError, LLMUnavailableError, AND
   LLMAbortedError — the new typed errors replace the bare Error.
   Return [] on any of them. Verify with a test.
3. maxTokens=2048 (NOT 1024). The inline comment in the file explains
   why (M2.7 chain-of-thought needs the room) — preserve it.
4. Both timeouts are already 3000ms — trivial collapse, no decision.
5. userMessages is single-turn ([{role:'user', content:'Generate the
   chips now.'}]) — just pass that content string as `user`. No
   history threading needed.
6. Post-call filtering (trim, length<=40, slice(0,3)) stays in
   generateSuggestions — that's caller business logic, not Module
   concern.

Drop:
- callerTag ('eVi-suggestions') — telemetry is side-channel inside Module
- temperature=0.3 — Module-internal
- The post-call SuggestionsSchema.safeParse — schema validation moves
  INTO callLLM via the `schema` param
- The `if (provider === 'minimax') console.warn(...)` block — provider
  info no longer surfaces; telemetry is logger-only inside Module

TDD discipline:
- One test → one impl change → repeat.
- Existing tests in suggestions-client.test.ts must all pass after
  migration. Update mock imports.
- Add a regression test that confirms LLMSchemaError → returns []
  (the silent-failure contract is generateSuggestions' value-add over
  the Module's throws).
- If a real test exposes a behavior gap from the PR-1 list, add a
  failing test for it FIRST, then fix in llm-module.ts before
  continuing.
- Don't touch llm-call.ts. That's PR 4/4 (deletion).
- Don't touch parseTrip — already migrated in PR 2/4.

Heads-up — out of scope but flagged in PR 2:
- src/app/api/route/narrative/route.ts is a THIRD callJsonLLM caller
  not in the original 4-PR plan. PR 4/4 (deleting llm-call.ts) cannot
  land until narrative migrates too. Either bundle narrative into this
  PR (renaming to "PR 3/4 — migrate remaining callJsonLLM callers")
  or insert PR 3.5 before PR 4. Decide BEFORE starting and commit to
  the choice. If bundling: same Interface, same patterns; if splitting:
  leave narrative for a follow-up.

Success criteria:
- suggestions-client.ts imports callLLM from './llm-module' (not callJsonLLM)
- All suggestions-client tests pass (existing + the new LLMSchemaError
  silent-fail regression test)
- Full vitest suite green (1197+ baseline — count should grow, never
  shrink per CLAUDE.md)
- npx tsc --noEmit clean
- Commit as: feat(evi): migrate generateSuggestions to deepened LLM
  module (PR 3/4)
  (or "PR 3/4 — migrate remaining callJsonLLM callers" if narrative
  is bundled in)
```

---

## Decision recorded — split, not bundle (2026-05-06)

PR 3 shipped as `generateSuggestions` only. The narrative caller was **not** bundled, on the grounds that:

- narrative needs a real timeout-collapse decision (`primaryTimeoutMs=15000` + `fallbackTimeoutMs=50000` → one `timeoutMs`) that changes per-attempt budget semantics
- narrative's HTTP error mapping switches from `/Both providers failed/i.test(message)` regex to `instanceof LLMUnavailableError` — a real cleanup, but a different review surface from suggestions
- bundling couples the blast radius of two unrelated callers

So PR 4 (deletion of `llm-call.ts`) is now blocked on a follow-up: **PR 3.5 — migrate narrative caller**. See `pr-3-5-narrative.md`.

## After PR 3 lands

1. **PR 3.5** — migrate `src/app/api/route/narrative/route.ts` per `pr-3-5-narrative.md`.
2. **PR 4/4** — only after PR 3.5 lands: delete `llm-call.ts` + `llm-call.test.ts`. Re-check `llm-providers.ts` exports (the `PRIMARY_PROVIDER`/`FALLBACK_PROVIDER` aliases) — keep or drop based on whether `llm-module.ts` still references them.
