# P0: eVi LLM provider chain is down in production

Status: open. This note documents the bug and does not fix it. Code references are at commit `64db6f92e0792aa4643b2ba76958ff0843b80567`.

## Summary

On production (https://evoyage.duypham.me), every eVi trip message ends with "Xin lỗi, dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau." (HTTP 503), and the AI trip narrative fails with HTTP 500. Both LLM providers are broken. The OpenAI primary fails fast, most likely on a revoked key. The MiniMax fallback asks for a model, `MiniMax-M2.7`, that MiniMax has retired. A classification bug in `llm-module.ts` also skips the fallback for auth and JSON errors, so it would not help even if it were healthy.

## Severity and priority

- **P0 / critical.** eVi, the headline AI feature, does not work for any user. Route planning (`/api/route`) still works.
- The client auto-retries a 503 twice (`src/hooks/useEVi.ts:43-44`, `:285-307`), so users wait about 15-20 s before they see the error. Each retry also costs another LLM call during the outage.

## Affected features

| Feature | Endpoint / module | Observed |
|---|---|---|
| eVi trip parse | `POST /api/evi/parse` → `parseTrip` → `callLLM` | 503 `service_unavailable` |
| AI route narrative | `POST /api/route/narrative` → `callLLM` | 500 `Failed to generate route narrative` |
| eVi suggestion chips | `suggestions-client.ts` → `callLLM` | expected to come back empty (not probed separately) |

Chain: `src/lib/evi/llm-providers.ts` (OpenAI `gpt-5` → MiniMax `MiniMax-M2.7`), run by `callLLM` in `src/lib/evi/llm-module.ts` (ADR-0002, ADR-0010).

---

## Finding 1: eVi trip parse returns 503 in production (critical)

**Symptom.** A normal Vietnamese trip request gets the "dịch vụ tạm thời không khả dụng" bubble after about 3 attempts.

**Evidence.**

```
curl -sS -o - -w '\nHTTP %{http_code} time %{time_total}\n' -X POST https://evoyage.duypham.me/api/evi/parse \
  -H 'content-type: application/json' \
  --data '{"message":"Tôi muốn đi từ Hà Nội đến Hạ Long bằng VinFast VF 8, pin còn 70%"}'
```

Observed 2026-11-01, three separate runs (6.4 s, 6.4 s, 4.9 s): HTTP 503, body `{"error":"service_unavailable","displayMessage":"Xin lỗi, dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.",...}` with every `tripParams` field null. A different prompt ("Đi Đà Lạt từ Quận 1, VF8, pin 80%") gave the same result (5.0 s).

- `src/app/api/evi/parse/route.ts:57-67`: any throw from `parseTrip` becomes a 503. The log tag is `both_providers_failed` only for `LLMUnavailableError`, otherwise `unexpected`.
- `src/lib/evi/minimax-client.ts:46`: parse timeout is 12 s. A 5-6 s failure is therefore a fast provider error, not a timeout.
- Local probe, done by the audit outside the repo with the same request parameters as `llm-module.ts:68-89`: the OpenAI key from `.vercel/.env.production.local` (pulled 2026-09-30) returned `401 Incorrect API key provided`, and `GET /v1/models` with it also returned 401.

**Root cause.**
- *Established:* the fallback is dead (Finding 2). A 401/403 or malformed JSON from the primary never reaches the fallback anyway (Finding 3).
- *Hypothesis (likely, not verified against the live Vercel env):* `OPENAI_API_KEY` in Vercel Production is revoked or invalid. The locally pulled copy returns 401. A 401 is non-infrastructure (`llm-module.ts:42-59`), so `callLLM` rethrows at `:139` without trying MiniMax, and the route logs `[eVi] parseTrip failed (unexpected): ...401...`. A quota error, a model-access error or a `response_format` rejection would produce the same 503. Only the Vercel logs can tell these apart.

**Repro.** Run the curl above, or open eVi on `/plan` in prod and send any trip request.

**Regression test.** Not unit-testable: this is the live env and the live provider state. The code-level part is covered by the Finding 3 tests.

**Fix direction.**
1. Ops first. Read the Vercel runtime logs for `/api/evi/parse` and `/api/route/narrative`, and look for `[eVi] parseTrip failed (`, `[narrative] AI generation failed:` and `[llm] provider=`. Get the exact primary error, then rotate `OPENAI_API_KEY` in Vercel Production if it is the key. Redeploy, or confirm that env changes apply to new invocations.
2. Code: Findings 2 and 3.
3. Consider a deploy-time or cron smoke check that makes one call per provider, so a dead key or a retired model is caught before users hit it. Today every test mocks the `openai` SDK.

---

## Finding 2: fallback model `MiniMax-M2.7` is retired (404) (high; verifiers rated it medium)

**Symptom.** Whenever the primary has an infrastructure failure (timeout, 429, 5xx, network, missing key), the fallback fails too. The availability promise in ADR-0010 ("The fallback exists for availability") no longer holds.

**Evidence.**
- `src/lib/evi/llm-providers.ts:25`: `defaultModel: 'MiniMax-M2.7'`, hard-coded. There is no env override (`llm-module.ts:69` passes `provider.defaultModel` through).
- Live probe against `https://api.minimax.io/v1/chat/completions` with the production `MINIMAX_API_KEY`, run by the audit author and both verifiers: `404 The model "MiniMax-M2.7" is no longer available. (2069)`. The key was accepted; the error is about the model.
- `isInfrastructureError` (`llm-module.ts:42-59`) does not match a 404. So when the primary has an outage and the fallback 404s, the raw SDK error escapes `callLLM` instead of `LLMUnavailableError`. The parse route then logs `unexpected`, and the narrative route returns 500 instead of 503 (`src/app/api/route/narrative/route.ts:124-141`).

**Root cause (established).** MiniMax retired the model id. Nothing in CI or monitoring calls the real fallback API.

**Repro.**

```
curl -sS https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" -H 'content-type: application/json' \
  --data '{"model":"MiniMax-M2.7","messages":[{"role":"user","content":"hi"}],"max_tokens":16}'
# with MINIMAX_API_KEY=[SENSITIVE] set from Vercel Production env
```

Expected today: 404 "no longer available".

**Regression test.**
- The retired model id itself is not unit-testable, because it is live provider state.
- The error-classification part is covered by `src/lib/evi/llm-module.test.ts` › `callLLM — fallback classification (BUG p0-evi-llm-chain-down)` › `throws LLMUnavailableError when the primary has an outage and the fallback model is retired (404)` (`it.fails`).

**Fix direction.** In `src/lib/evi/llm-providers.ts`, set `MINIMAX_PROVIDER.defaultModel` to a model MiniMax currently serves; check MiniMax's model list, do not guess. Re-check `stripProviderQuirks` (`llm-module.ts:121-127`), because the `<think>` and fence stripping was tuned to M2.7 output. Re-check the `temperature: 0.1` / `max_tokens` params (`:78`) against the new model. Make the exhausted-chain error always surface as `LLMUnavailableError`, and log it at alert level.

---

## Finding 3: fallback is skipped on primary auth errors and malformed JSON (medium)

**Symptom.** If OpenAI rejects the key (401/403) or returns text that is not JSON, MiniMax is never tried and the user gets a 503. Each provider reads its own key (`llm-module.ts:62`: `OPENAI_API_KEY` vs `MINIMAX_API_KEY`), so a revoked OpenAI key is exactly the case a fallback should cover. These failures are logged as `unexpected`, not `both_providers_failed`, which hides the provider outage. With the 401 path, `llm-module` itself logs nothing (asserted by the existing test at `llm-module.test.ts:411`).

**Evidence.**
- `llm-module.ts:42-59` accepts only AbortError, 429, >=500, network messages, empty or thinking-only content, and "is not set". A *missing* key falls back (`:57`), but an *invalid* key (401) does not.
- `llm-module.ts:104`: `JSON.parse(cleaned)` has no guard, so a `SyntaxError` escapes untyped.
- `llm-module.ts:139`: `if (!isInfrastructureError(e)) throw e;` rethrows raw, without wrapping it.
- Existing tests that encode the wrong premise: `llm-module.test.ts:423-442` ("does not fall back on HTTP 401 (auth issue — fallback would also fail)", and the 400 case) and `:411-420` (no log lines on 401).

**Root cause (established).** `isInfrastructureError` treats 401/403 as a caller error, on the assumption that both providers share a credential. They do not. JSON parse failures have no classification at all.

**Repro.**

```
cd <worktree> && npx vitest run src/lib/evi/llm-module.test.ts
```

The four tests in `callLLM — fallback classification (BUG p0-evi-llm-chain-down)` report as "expected fail". To see the real failures, change `it.fails` to `it`: the 401 and 403 cases throw the raw provider error, and the JSON case throws `SyntaxError: Unexpected token 'S'...`.

**Regression tests** (all in `src/lib/evi/llm-module.test.ts`, all `it.fails`, all currently report as expected fail):
- `falls back to MiniMax when the primary rejects its own API key with HTTP 401`
- `falls back to MiniMax when the primary returns HTTP 403`
- `falls back to MiniMax when the primary returns content that is not valid JSON`
- `throws LLMUnavailableError when the primary has an outage and the fallback model is retired (404)` (Finding 2)

**Fix direction.** In `src/lib/evi/llm-module.ts`:
- Make provider-level 401/403 (and probably a 404 model-not-found) fallback-eligible.
- Wrap `JSON.parse` so that malformed JSON on a non-last provider falls through.
- When the chain is exhausted, always throw `LLMUnavailableError`, so `route.ts:62` logs `both_providers_failed` and the narrative route returns 503.

Gotchas:
- **Keep 400 non-fallback.** A 400 is a request-shape bug, and the fallback would usually reject the same request.
- **The `LLMSchemaError` policy is a separate decision.** Both verifiers note that ADR-0002 deliberately splits infrastructure errors from schema errors, so a schema failure not falling back is a policy choice, not a clear bug. No test encodes it.
- **Update the conflicting tests.** When flipping the `it.fails`, also update `llm-module.test.ts:411-442`: the 401 cases there assert the buggy behaviour.
- **Logging.** A 401 should log at warn or error level, so a revoked key is visible.

---

## Finding 4: eVi chat and AI trip narrative fail in production (high; one verifier rated it critical)

**Symptom.** On mobile, after "Đi Đà Lạt từ Quận 1, VF8, pin 80%", the network log shows `POST /api/evi/parse` → 503 three times (client retries). After planning HCM → Đà Lạt, `POST /api/route/narrative` → 500, and the narrative block shows a skeleton, then disappears.

**Evidence.**
- A verifier reproduced both failures about 15 minutes after the first observation, so this is not a one-off: parse 503 in 4.9 s, narrative 500 in 5.6 s with body `{"overview":null,"narrative":null,"error":"Failed to generate route narrative"}`.
- `narrative/route.ts:124-141` returns 503 only for `LLMUnavailableError`. The 500 therefore means the escaping error was a raw rethrow from `llm-module.ts:139` (401/403/404, JSON SyntaxError) or an `LLMSchemaError`. It was not "every provider is down" in the module's own classification.

**Root cause.**
- *Hypothesis:* the same as Finding 1, a fast non-infrastructure primary error, most likely a 401 on the OpenAI key.
- *Ruled out:* a timeout. Both calls failed well under the 12 s / 30 s timeouts.
- *Not established:* the exact provider error. It needs the Vercel logs.

**Repro.** Plan any trip on prod `/plan` and watch `POST /api/route/narrative`. Or call it directly with a valid narrative body. The audit's body was Quận 1 → Đà Lạt, 300 km, one charging stop; see `src/app/api/route/narrative/route.test.ts` for the request shape.

**Regression test.** Not unit-testable: live env and provider state. The classification that turns this into a 500 rather than a 503 is covered by the Finding 2 and 3 tests.

**Fix direction.** Same ops step as Finding 1. Separately, decide whether `useEVi.ts` should stop retrying a 503 when the server says every provider is exhausted, for example with a distinct error code. Today a provider outage triples the LLM cost and the user's wait.

---

## Related low-severity items

None in this group.

## Open questions / what to verify first

1. **Vercel logs.** In the Vercel runtime logs, is the primary error `401 Incorrect API key provided` or something else, and is the tag `(unexpected)` or `(both_providers_failed)`? Settle this before changing code; it decides whether a key rotation alone restores service.
2. **Key match.** Is the key in Vercel Production the same one as the locally pulled copy from 2026-09-30, which is confirmed revoked?
3. **Replacement model.** Which MiniMax model replaces `MiniMax-M2.7`, and does its output still need `stripProviderQuirks`?
4. **Schema policy.** Should `LLMSchemaError` on the primary fall back? This is a policy decision against ADR-0002, so it may need an ADR update.
5. **Suggestion chips.** Are the suggestion chips also silently empty? Assumed, not probed.

## Verification provenance

- Audit run 2026-11-01 against HEAD `bfa3a3b` and live prod. Each finding was checked by 2 adversarial verifier agents; none was refuted, and the severity votes are noted per finding.
- Re-confirmed by reading the code at `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) on 2026-11-01. All cited line numbers still hold, and no finding was dropped.
- The verifiers were Claude agents: same vendor, same priors; no external verifier ran.
