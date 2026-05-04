# eVi LLM — Xiaomi MiMo Primary, Minimax M2.7 Fallback

**Status**: Awaiting approval (drafted 2026-05-04)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: Performance patch on top of Phase 1 eVi (`2026-03-20-evi-ai-trip-assistant-design.md`). Not a new phase. Touches three existing LLM call sites; no new product surface.

**Project framing**: Per `feedback_no_mvp_serious_features.md` — build the abstraction properly, not as a one-off swap. Per `feedback_zero_infra_cost.md` — MiMo Flash at $0.10/$0.30 per 1M tokens keeps eVi well under any meaningful spend (≈ $0.0003 per typical trip parse).

## 1. Problem

eVi's three text-LLM call sites all use Minimax M2.7. M2.7 is a deep-thinking model that emits a multi-thousand-token `<think>` chain-of-thought before its JSON answer, which has produced user-visible slowness:

| Caller | File | Current timeout | Typical observed latency |
|---|---|---|---|
| Trip parser | `src/lib/evi/minimax-client.ts` | 25s | ~10–20s |
| Suggestion chips | `src/lib/evi/suggestions-client.ts` | 3s | often times out → empty chips |
| Route narrative | `src/app/api/route/narrative/route.ts` | **55s** | routinely 30–50s; Vercel `maxDuration = 60` exists *because* of M2.7 |

The narrative timeout is the most painful — users wait nearly a minute after solving their trip to see the briefing.

## 2. Goal

Make MiMo (`mimo-v2-flash`) the primary provider for all three callers. Keep Minimax M2.7 as automatic fallback for hard infrastructure errors. Build a small shared abstraction so the three callers stop duplicating boilerplate.

**Verifiable outcome**: After this change,
- Typical trip-parse turn drops from ~15s to ~2–4s.
- Typical narrative generation drops from ~30–50s to ~3–8s.
- Suggestion chips return populated arrays consistently (no more silent timeouts).
- When MiMo is genuinely down, calls succeed via Minimax fallback (regression-tested).

## 3. Non-goals

- Streaming responses (no current consumer streams; SSE remains in `transcribe/route.ts` only).
- A runtime "force fallback" UI toggle (env var change + redeploy is acceptable).
- Provider health metrics dashboard (`console.error` with the failure reason is enough for now).
- Touching `src/app/api/transcribe/route.ts` — it uses Minimax's audio-transcription API, a different surface.
- Switching the eVi prompt itself. We change the model, not what we ask it.

## 4. Provider research summary

Confirmed against `https://platform.xiaomimimo.com/static/docs/api/chat/openai-api.md` and `.../quick-start/first-api-call.md`:

- **Base URL**: `https://api.xiaomimimo.com/v1` (OpenAI-compatible — works with the `openai` npm SDK we already import)
- **Auth**: `Authorization: Bearer $KEY`
- **Model picked**: `mimo-v2-flash` — 256K context, 64K max output, supports `function call`, `structured output`, `streaming`. Cheapest in the lineup.
- **Pricing**: $0.10 / 1M input, $0.30 / 1M output (overseas)
- **Rate limits**: 100 RPM, 10M TPM (well above eVi's needs)
- **`<think>` handling**: MiMo's thinking models return `reasoning_content`, but Flash is a non-thinking model — clean output, no tag stripping needed (we still keep the strip defensively in case Xiaomi ships a thinking-Flash variant later).

## 5. Architecture

```
src/lib/evi/
├── llm-providers.ts      [NEW]  Provider configs (mimo, minimax)
├── llm-call.ts           [NEW]  callJsonLLM() — primary + fallback orchestrator
├── minimax-client.ts     [MOD]  parseTrip() now delegates to callJsonLLM
├── suggestions-client.ts [MOD]  generateSuggestions() now delegates to callJsonLLM
└── (test files updated)

src/app/api/route/narrative/route.ts  [MOD]  delegates to callJsonLLM
.env.example                          [MOD]  document XIAOMI_MIMO_API_KEY + MINIMAX_API_KEY
```

We **keep `minimax-client.ts` as the filename** even though it now uses MiMo by default, to avoid churning every import. Mark this as a follow-up rename if it bothers anyone.

### 5.1 `llm-providers.ts`

```ts
export type LLMProviderName = 'mimo' | 'minimax';

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly baseURL: string;
  readonly envVar: string;
  readonly defaultModel: string;
}

export const MIMO_PROVIDER: LLMProvider = {
  name: 'mimo',
  baseURL: 'https://api.xiaomimimo.com/v1',
  envVar: 'XIAOMI_MIMO_API_KEY',
  defaultModel: 'mimo-v2-flash',
};

export const MINIMAX_PROVIDER: LLMProvider = {
  name: 'minimax',
  baseURL: 'https://api.minimax.io/v1',
  envVar: 'MINIMAX_API_KEY',
  defaultModel: 'MiniMax-M2.7',
};

export const PRIMARY_PROVIDER = MIMO_PROVIDER;
export const FALLBACK_PROVIDER = MINIMAX_PROVIDER;
```

### 5.2 `llm-call.ts` — single orchestrator

Single export consumed by all three call sites:

```ts
export interface CallJsonLLMInput {
  readonly systemPrompt: string;
  readonly userMessages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly primaryTimeoutMs: number;
  readonly fallbackTimeoutMs: number;
  /** Per-call model override; defaults to provider.defaultModel. */
  readonly modelOverride?: { mimo?: string; minimax?: string };
  /** For diagnostics in logs. e.g. 'eVi-parse', 'eVi-suggestions', 'narrative'. */
  readonly callerTag: string;
}

export interface CallJsonLLMResult {
  /** Parsed JSON object — caller is responsible for Zod-validating shape. */
  readonly json: unknown;
  /** Which provider produced the answer. */
  readonly provider: LLMProviderName;
}

export async function callJsonLLM(input: CallJsonLLMInput): Promise<CallJsonLLMResult>;
```

#### Behavior

1. Try **primary** (MiMo). On success → return `{ json, provider: 'mimo' }`.
2. **Fall back to Minimax** if primary fails for any of:
   - Network error (DNS, connection refused, ECONNRESET)
   - Abort due to timeout
   - HTTP 5xx
   - HTTP 429 (rate limit)
   - Empty response from the API (no `choices[0].message.content`)
3. **Do NOT fall back** for:
   - JSON.parse failure on cleaned content (caller-visible: bad model output)
   - Caller-side Zod validation failure (caller decides what to do)
   - Missing primary API key → log clear error, **still try fallback** (we want degraded service over outage)
   - Missing both keys → throw a clear "no LLM available" error
4. Log every fallback with `console.warn('[llm-call] callerTag=X primary=mimo failed: <reason> — falling back to minimax')`.
5. Strip both `<think>...</think>` blocks and ```` ```json ... ``` ```` fences before returning (defensive — we hit both with M2.7 in prod).

#### Timeout strategy

Each caller passes `primaryTimeoutMs` (tight, MiMo-Flash-sized) and `fallbackTimeoutMs` (loose, M2.7-sized). Worst case is sum of both.

| Caller | `primaryTimeoutMs` | `fallbackTimeoutMs` | Worst case | Old timeout |
|---|---|---|---|---|
| trip parser | 8s | 25s | 33s | 25s |
| suggestions | 3s | 3s | 6s | 3s |
| narrative | 15s | 50s | 65s | 55s |

Worst case grows for narrative (55s → 65s) and suggestions (3s → 6s). Acceptable: this only triggers when MiMo is degraded.

**Vercel `maxDuration` change**: `narrative/route.ts` currently has `maxDuration = 60`. We bump to **70** so the worst-case 65s (15s primary + 50s fallback + a few seconds of overhead) does not get killed by the platform.

### 5.3 Caller refactor pattern

Each caller becomes ~50 lines of "build prompt + call helper + validate + return". Example for `parseTrip`:

```ts
// minimax-client.ts (after refactor)
export async function parseTrip(input: ParseInput): Promise<MinimaxTripExtractionResult> {
  const systemPrompt = buildSystemPrompt(input.vehicleListText, input.accumulatedParams);
  const userMessages = [
    ...input.history,
    { role: 'user' as const, content: input.message },
  ];

  const { json, provider } = await callJsonLLM({
    systemPrompt,
    userMessages,
    maxTokens: 1024,
    temperature: 0.1,
    primaryTimeoutMs: 8000,
    fallbackTimeoutMs: 25000,
    callerTag: 'eVi-parse',
  });

  if (provider === 'minimax') {
    console.warn('[eVi-parse] served via Minimax fallback');
  }

  return MinimaxTripExtraction.parse(json);
}
```

Same shape for `generateSuggestions` and the narrative POST handler.

## 6. Env vars

`.env.example`:

```bash
# eVi LLM providers
# Primary: Xiaomi MiMo (mimo-v2-flash) — fast, cheap, OpenAI-compatible
# Get a key at https://platform.xiaomimimo.com/#/console/api-keys
XIAOMI_MIMO_API_KEY=

# Fallback: Minimax M2.7 — used when MiMo is degraded
# Get a key at https://platform.minimax.io
MINIMAX_API_KEY=
```

`.env.local` (Duy adds locally + Vercel env): `XIAOMI_MIMO_API_KEY=...`. Existing `MINIMAX_API_KEY` stays.

## 7. Tests

### New: `src/lib/evi/llm-call.test.ts`
- Primary success → returns `{ json, provider: 'mimo' }`, no Minimax call
- Primary timeout → fallback called, returns `{ json, provider: 'minimax' }`
- Primary HTTP 5xx → fallback called
- Primary HTTP 429 → fallback called
- Primary network error → fallback called
- Primary returns empty content → fallback called
- Primary returns malformed JSON → throws (no fallback)
- Both providers fail → throws aggregate error mentioning both
- Missing primary key → fallback called, warning logged
- Missing both keys → throws clear "no LLM available"
- `<think>` block stripped before JSON.parse
- ```` ```json ```` fence stripped before JSON.parse

### Updated existing tests
- `src/lib/evi/minimax-client.test.ts` — mocks `callJsonLLM` instead of OpenAI directly. Existing parser-behavior assertions preserved.
- `src/lib/evi/suggestions-client.test.ts` — same.
- `src/app/api/route/narrative/` — if `route.test.ts` exists, mock `callJsonLLM`; otherwise rely on `llm-call.test.ts` for the orchestration coverage.

### Manual smoke tests (Duy runs after deploy)
- Trip parse: "đi Đà Lạt từ Sài Gòn cuối tuần" with VF 6 — confirm provider in browser console (we'll log it) and timing.
- Narrative: complete a trip with 3+ charging stops — confirm narrative under 10s.
- Suggestions: open eVi mid-conversation — confirm 3 chips appear within 3s.

## 8. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| MiMo Flash extracts trips worse than M2.7 on ambiguous Vietnamese inputs | Medium | Prompt is well-structured (vehicle list + JSON schema). Manually test 5 ambiguous prompts before merging. Fallback to M2.7 if Flash misbehaves on a specific input pattern: document the pattern, consider model upgrade. |
| MiMo's `mimo-v2-flash` ID changes / gets deprecated | Low | Single string in `llm-providers.ts`. One-line fix. |
| Both providers down at the same time | Very low | We throw an aggregate error → eVi UI already shows a "try again later" state. Same UX as today when M2.7 is down. |
| Cost surprise | Very low | At MiMo's overseas pricing, 100K calls/month ≈ $30. eVi traffic is far below that. Set up Xiaomi billing alerts after deploy. |
| Test mocks drift from real API behavior | Medium | `llm-call.test.ts` covers the orchestration; we keep the existing real-API integration tests for `minimax-client` and add a manual smoke test in §7. |

## 9. Rollout

Single PR. No feature flag — env var presence is the switch. Steps:

1. Land code (this design's implementation).
2. Add `XIAOMI_MIMO_API_KEY` to Vercel env (preview + production).
3. Deploy to preview, run §7 manual smokes.
4. Merge to main.
5. Watch Vercel logs for `[llm-call]` warnings the first 24h. If MiMo is failing >5% of calls, investigate before that becomes the user's problem.

## 10. Follow-ups (not this PR)

- Rename `minimax-client.ts` → `trip-parser.ts` once we're confident the abstraction is stable.
- Consider `mimo-v2.5` (the multimodal sibling) for narrative if Flash quality is noticeably worse than M2.7 there.
- If we add a 3rd provider later, the `LLMProvider` interface should accommodate it without further refactor.
