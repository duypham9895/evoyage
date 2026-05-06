/tdd

Final cleanup: delete src/lib/evi/llm-call.ts and src/lib/evi/llm-call.test.ts.
PR 1 (Module), PR 2 (parseTrip), PR 3 (generateSuggestions), and PR 3.5
(narrative route) have all migrated off callJsonLLM. Nothing imports it now.

Read these first:
- docs/adr/0002-llm-call-module.md — the locked Interface contract
- src/lib/evi/llm-call.ts — what you're deleting
- src/lib/evi/llm-call.test.ts — what you're deleting
- src/lib/evi/llm-providers.ts — re-evaluate after deletion
- The "Known behavior gaps" section of git log -1 --grep="PR 1/4" — these
  gaps were tracked against the OLD code; some may now be defunct, others
  worth porting forward as Module tests if a real failure justifies it
  (Karpathy Rule 2: no speculative fixes)

Verification BEFORE deleting (do this first, fail fast if wrong):
1. `grep -rn "callJsonLLM\|from '@/lib/evi/llm-call'\|from './llm-call'" src/`
   → should return zero hits. If anything matches, stop and migrate that
   caller first; you weren't supposed to be in PR 4/4 yet.
2. `grep -rn "primaryTimeoutMs\|fallbackTimeoutMs\|callerTag" src/`
   → should return zero hits (these were callJsonLLM-only knobs).
3. `grep -rn "PRIMARY_PROVIDER\|FALLBACK_PROVIDER\|LLMProviderName" src/`
   → currently only references are inside llm-providers.ts itself. After
   deleting llm-call.ts, confirm nothing in PR 1's llm-module.ts uses
   them (it imports MIMO_PROVIDER + MINIMAX_PROVIDER directly).

llm-providers.ts cleanup (Karpathy Rule 3 — Surgical):
- DROP: `PRIMARY_PROVIDER` and `FALLBACK_PROVIDER` aliases. They were
  callJsonLLM's vocabulary (which provider goes first vs. second). The
  Module owns the chain via `PROVIDER_CHAIN = [MIMO, MINIMAX]` inline,
  so the role aliases have no external readers anymore.
- KEEP: `LLMProviderName` type. It narrows the `name` field of `LLMProvider`
  to a literal union ('mimo' | 'minimax') — that constraint still has
  value for telemetry tags and future logging, even if no caller imports
  the bare type today. (If you grep and find truly zero callers + zero
  internal use beyond the interface field, you can inline it as
  `name: 'mimo' | 'minimax'` and drop the export — your call.)
- KEEP: `MIMO_PROVIDER`, `MINIMAX_PROVIDER`, `LLMProvider` interface —
  consumed by llm-module.ts.

TDD discipline (deletion edition):
- The "test" here is: the rest of the suite stays green after the file
  vanishes. There's no new behavior to drive with a failing test, so the
  red→green cycle collapses to "delete file → run suite → confirm no
  regression".
- BEFORE deletion: run `npm test` once to capture baseline (1200 tests
  expected; PR 3.5 just shipped).
- DELETE llm-call.test.ts FIRST, run tests (count drops by however many
  llm-call tests there were — note the new baseline).
- THEN delete llm-call.ts, run tests + `npx tsc --noEmit`.
- If tsc surfaces a missed import anywhere, that's a real bug — the grep
  step above should have caught it. Investigate before patching.
- DO NOT add new tests to llm-module.ts in this PR. The "Known behavior
  gaps" list from PR 1's commit is a separate backlog (network error
  patterns, empty-response fallback, missing-API-key handling, mid-call
  signal linking). Each gap deserves its own PR with a real failure
  scenario, not a speculative fix bundled into the cleanup commit.

Decision to make and document in the commit body:
- Whether `LLMProviderName` survives the cleanup or gets inlined. State
  the call + reasoning.

Success criteria:
- src/lib/evi/llm-call.ts and src/lib/evi/llm-call.test.ts no longer exist
- `grep -rn "callJsonLLM\|llm-call" src/` returns zero hits
- llm-providers.ts no longer exports PRIMARY_PROVIDER / FALLBACK_PROVIDER
- Full vitest suite green (count drops only by the size of the deleted
  llm-call test file — note exact delta in commit body)
- npx tsc --noEmit clean
- ADR 0002 status updated to "Implemented" (or equivalent — check the
  ADR template for the correct closing-state vocabulary)
- Commit as: chore(evi): remove legacy callJsonLLM module (PR 4/4)

After this lands, the deepening migration is complete. The eVi LLM call
path is callLLM-only; provider-quirk knowledge (think tags, markdown
fences, fallback chain) lives behind the Module Seam; callers know only
{schema, system, user, maxTokens?, timeoutMs?, signal?}.
