# eVi LLM — MiMo Primary, Minimax Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap eVi's three text-LLM call sites from Minimax M2.7 to Xiaomi MiMo (`mimo-v2-flash`) as primary, with M2.7 as automatic fallback on hard infrastructure errors. Introduce a shared `callJsonLLM()` helper to remove ~30 lines of duplicated boilerplate per caller.

**Architecture:** A new `src/lib/evi/llm-call.ts` module exports `callJsonLLM()` that takes prompt + timeout config and returns `{ json, provider }`. It calls MiMo first; on hard infra errors (network, timeout, 5xx, 429, empty response) it transparently retries on Minimax. JSON.parse and Zod validation failures are surfaced to the caller — not faded into a fallback. The three existing callers (trip parser, suggestion chips, route narrative) each shrink to ~50 lines that build their prompt, call the helper, and validate the result.

**Tech Stack:** Next.js 14 App Router, TypeScript, `openai` npm SDK (talks to both providers — both are OpenAI-compatible), Zod for schema validation, Vitest for tests, Vercel for deploy.

**Spec reference:** [`docs/specs/2026-05-04-mimo-primary-minimax-fallback-design.md`](../specs/2026-05-04-mimo-primary-minimax-fallback-design.md)

---

## File Structure

| Path | Action | Purpose |
|---|---|---|
| `.env.example` | Modify | Document `XIAOMI_MIMO_API_KEY` + `MINIMAX_API_KEY` |
| `src/lib/evi/llm-providers.ts` | **Create** | Static provider configs (mimo, minimax) |
| `src/lib/evi/llm-call.ts` | **Create** | `callJsonLLM()` orchestrator with primary + fallback |
| `src/lib/evi/llm-call.test.ts` | **Create** | Orchestrator tests (12 cases) |
| `src/lib/evi/minimax-client.ts` | Modify | `parseTrip()` delegates to `callJsonLLM` |
| `src/lib/evi/minimax-client.test.ts` | Modify | Update mocks to target `callJsonLLM` |
| `src/lib/evi/suggestions-client.ts` | Modify | `generateSuggestions()` delegates to `callJsonLLM` |
| `src/lib/evi/suggestions-client.test.ts` | Modify | Update mocks |
| `src/app/api/route/narrative/route.ts` | Modify | POST handler delegates to `callJsonLLM`, `maxDuration = 70` |
| `src/app/api/route/narrative/route.test.ts` | Modify | Update mocks |

---

## Task 1: Document env vars in `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Read current `.env.example` and add LLM section above PostHog**

Current content (only PostHog block exists). Replace the entire file with:

```bash
# eVi LLM providers
# Primary: Xiaomi MiMo (mimo-v2-flash) — fast, cheap, OpenAI-compatible.
# Get a key at https://platform.xiaomimimo.com/#/console/api-keys
XIAOMI_MIMO_API_KEY=

# Fallback: Minimax M2.7 — used when MiMo is degraded.
# Get a key at https://platform.minimax.io
MINIMAX_API_KEY=

# PostHog analytics (optional)
# Leave empty to disable analytics entirely. Analytics also auto-disable when
# NODE_ENV !== 'production', so dev and tests never fire events.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document XIAOMI_MIMO_API_KEY and MINIMAX_API_KEY"
```

---

## Task 2: Create `llm-providers.ts`

**Files:**
- Create: `src/lib/evi/llm-providers.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/evi/llm-providers.ts
//
// Static configs for the two LLM providers eVi uses. Both speak the
// OpenAI chat-completions wire format, so the `openai` npm SDK works
// with each by swapping `apiKey` and `baseURL`.

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

export const PRIMARY_PROVIDER: LLMProvider = MIMO_PROVIDER;
export const FALLBACK_PROVIDER: LLMProvider = MINIMAX_PROVIDER;
```

- [ ] **Step 2: Run typecheck to confirm file compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/evi/llm-providers.ts
git commit -m "feat(evi): add llm-providers config for mimo + minimax"
```

---

## Task 3: `callJsonLLM` — primary success path (TDD)

**Files:**
- Create: `src/lib/evi/llm-call.test.ts`
- Create: `src/lib/evi/llm-call.ts`

- [ ] **Step 1: Write test file scaffold + first failing test**

Create `src/lib/evi/llm-call.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture every OpenAI(...) constructor call so we can assert which
// provider was contacted (mimo baseURL vs minimax baseURL).
const constructorCalls: Array<{ apiKey: string; baseURL: string }> = [];
const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(opts: { apiKey: string; baseURL: string }) {
      constructorCalls.push(opts);
    }
    chat = { completions: { create: mockCreate } };
  },
}));

import { callJsonLLM } from './llm-call';

beforeEach(() => {
  constructorCalls.length = 0;
  mockCreate.mockReset();
  vi.stubEnv('XIAOMI_MIMO_API_KEY', 'mimo-test-key');
  vi.stubEnv('MINIMAX_API_KEY', 'minimax-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const SAMPLE_INPUT = {
  systemPrompt: 'You are a JSON bot. Respond with valid JSON.',
  userMessages: [{ role: 'user' as const, content: 'Say hi' }],
  maxTokens: 256,
  temperature: 0.1,
  primaryTimeoutMs: 1000,
  fallbackTimeoutMs: 2000,
  callerTag: 'test',
};

describe('callJsonLLM — primary success', () => {
  it('returns parsed JSON from MiMo when primary succeeds', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"hello":"world"}' } }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);

    expect(result.json).toEqual({ hello: 'world' });
    expect(result.provider).toBe('mimo');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(constructorCalls[0].apiKey).toBe('mimo-test-key');
  });

  it('passes model + max_tokens + temperature to the SDK', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
    });

    await callJsonLLM(SAMPLE_INPUT);

    const callArgs = mockCreate.mock.calls[0][0] as {
      model: string;
      max_tokens: number;
      temperature: number;
      response_format: { type: string };
    };
    expect(callArgs.model).toBe('mimo-v2-flash');
    expect(callArgs.max_tokens).toBe(256);
    expect(callArgs.temperature).toBe(0.1);
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: FAIL with "Cannot find module './llm-call'" or similar.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/evi/llm-call.ts`:

```ts
// src/lib/evi/llm-call.ts
//
// Single orchestrator the three eVi callers use. Tries MiMo first, falls
// back to Minimax M2.7 on hard infrastructure errors only. Strips both
// <think> and ```json fences from the response before JSON.parse.

import OpenAI from 'openai';
import {
  PRIMARY_PROVIDER,
  FALLBACK_PROVIDER,
  type LLMProvider,
  type LLMProviderName,
} from './llm-providers';

export interface CallJsonLLMInput {
  readonly systemPrompt: string;
  readonly userMessages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly primaryTimeoutMs: number;
  readonly fallbackTimeoutMs: number;
  readonly callerTag: string;
}

export interface CallJsonLLMResult {
  readonly json: unknown;
  readonly provider: LLMProviderName;
}

async function callProvider(
  provider: LLMProvider,
  input: CallJsonLLMInput,
  timeoutMs: number,
): Promise<unknown> {
  const apiKey = process.env[provider.envVar]?.trim();
  if (!apiKey) {
    throw new Error(`${provider.envVar} is not set`);
  }

  const client = new OpenAI({ apiKey, baseURL: provider.baseURL });
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: input.systemPrompt },
    ...input.userMessages.map(m => ({ role: m.role, content: m.content })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model: provider.defaultModel,
        messages,
        response_format: { type: 'json_object' },
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      },
      { signal: controller.signal },
    );

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error(`${provider.name} returned empty response`);
    }

    return JSON.parse(rawContent);
  } finally {
    clearTimeout(timer);
  }
}

export async function callJsonLLM(input: CallJsonLLMInput): Promise<CallJsonLLMResult> {
  const json = await callProvider(PRIMARY_PROVIDER, input, input.primaryTimeoutMs);
  return { json, provider: PRIMARY_PROVIDER.name };
}
```

- [ ] **Step 4: Run tests — both should pass now**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evi/llm-call.ts src/lib/evi/llm-call.test.ts
git commit -m "feat(evi): callJsonLLM primary path (no fallback yet)"
```

---

## Task 4: `callJsonLLM` — content stripping

**Files:**
- Modify: `src/lib/evi/llm-call.test.ts`
- Modify: `src/lib/evi/llm-call.ts`

- [ ] **Step 1: Add failing tests for `<think>` and ```` ```json ```` stripping**

Append to `describe('callJsonLLM — primary success', () => { ... })` block (still inside it):

```ts
  it('strips <think>...</think> blocks before JSON.parse', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '<think>let me think about this...</think>\n{"answer":42}',
        },
      }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ answer: 42 });
  });

  it('strips ```json ... ``` markdown fences before JSON.parse', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: '```json\n{"wrapped":true}\n```' },
      }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ wrapped: true });
  });

  it('strips both <think> AND ```json fences in one response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '<think>thinking...</think>\n```json\n{"both":"stripped"}\n```',
        },
      }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ both: 'stripped' });
  });
```

- [ ] **Step 2: Run tests — should fail (raw content goes to JSON.parse and throws SyntaxError)**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: FAIL on the three new tests (SyntaxError from JSON.parse)

- [ ] **Step 3: Update implementation to strip both wrappers**

In `src/lib/evi/llm-call.ts`, replace the lines:

```ts
    if (!rawContent) {
      throw new Error(`${provider.name} returned empty response`);
    }

    return JSON.parse(rawContent);
```

With:

```ts
    if (!rawContent) {
      throw new Error(`${provider.name} returned empty response`);
    }

    // M2.7 wraps responses in two layers we peel off before JSON.parse:
    // a <think>...</think> reasoning block (M2.7) and a markdown ```json
    // fence (returned even when response_format is json_object — observed
    // in prod 2026-05-04). MiMo Flash is non-thinking, but we keep the
    // strip defensively in case Xiaomi adds a thinking-Flash variant.
    const cleaned = rawContent
      .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
      .replace(/^\s*```(?:json)?\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();

    if (!cleaned) {
      throw new Error(`${provider.name} returned only thinking tags / fences`);
    }

    return JSON.parse(cleaned);
```

- [ ] **Step 4: Run tests — all 5 should pass**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evi/llm-call.ts src/lib/evi/llm-call.test.ts
git commit -m "feat(evi): strip <think> and ```json fences in callJsonLLM"
```

---

## Task 5: `callJsonLLM` — fallback on hard infrastructure errors

**Files:**
- Modify: `src/lib/evi/llm-call.test.ts`
- Modify: `src/lib/evi/llm-call.ts`

- [ ] **Step 1: Add a new `describe` block with five failing tests**

Append below the existing `describe` in `src/lib/evi/llm-call.test.ts`:

```ts
describe('callJsonLLM — fallback on hard errors', () => {
  function expectMimoThenMinimaxCalled() {
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(constructorCalls).toHaveLength(2);
    expect(constructorCalls[0].baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(constructorCalls[1].baseURL).toBe('https://api.minimax.io/v1');
  }

  it('falls back to Minimax when MiMo throws a network error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:443'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ from: 'minimax' });
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back when MiMo is aborted by timeout', async () => {
    const abortErr = Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
    mockCreate
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back on HTTP 5xx', async () => {
    const apiErr = Object.assign(new Error('Internal Server Error'), { status: 500 });
    mockCreate
      .mockRejectedValueOnce(apiErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back on HTTP 429 rate limit', async () => {
    const apiErr = Object.assign(new Error('Too Many Requests'), { status: 429 });
    mockCreate
      .mockRejectedValueOnce(apiErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back when MiMo returns empty content', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('throws aggregate error when both providers fail', async () => {
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 503 }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/both providers failed/i);
  });
});
```

- [ ] **Step 2: Run tests — all six should fail**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: 5 of the new tests FAIL because `callJsonLLM` does not yet retry; the "throws aggregate error" test may pass coincidentally but probably with the wrong message.

- [ ] **Step 3: Add fallback orchestration**

In `src/lib/evi/llm-call.ts`, add this helper above the existing `callJsonLLM` export:

```ts
function isHardInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Aborts (timeout)
  if (err.name === 'AbortError') return true;
  if (/abort/i.test(err.message)) return true;
  // OpenAI APIError shape — surfaces .status
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    if (status === 429 || status >= 500) return true;
  }
  // Network / connection errors (ECONNRESET, ECONNREFUSED, ENOTFOUND, ETIMEDOUT)
  if (/(ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network)/i.test(err.message)) {
    return true;
  }
  // Empty content (we throw this ourselves above)
  if (/returned empty response|returned only thinking/i.test(err.message)) {
    return true;
  }
  return false;
}
```

Then replace the body of `callJsonLLM` with:

```ts
export async function callJsonLLM(input: CallJsonLLMInput): Promise<CallJsonLLMResult> {
  let primaryError: Error | null = null;

  try {
    const json = await callProvider(PRIMARY_PROVIDER, input, input.primaryTimeoutMs);
    return { json, provider: PRIMARY_PROVIDER.name };
  } catch (err) {
    primaryError = err instanceof Error ? err : new Error(String(err));

    if (!isHardInfrastructureError(primaryError)) {
      throw primaryError;
    }

    console.warn(
      `[llm-call] callerTag=${input.callerTag} primary=${PRIMARY_PROVIDER.name} failed: ${primaryError.message} — falling back to ${FALLBACK_PROVIDER.name}`,
    );
  }

  try {
    const json = await callProvider(FALLBACK_PROVIDER, input, input.fallbackTimeoutMs);
    return { json, provider: FALLBACK_PROVIDER.name };
  } catch (fallbackErr) {
    const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    throw new Error(
      `Both providers failed. ${PRIMARY_PROVIDER.name}: ${primaryError?.message ?? 'unknown'}. ${FALLBACK_PROVIDER.name}: ${fallbackMessage}`,
    );
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evi/llm-call.ts src/lib/evi/llm-call.test.ts
git commit -m "feat(evi): fall back to Minimax on hard infrastructure errors"
```

---

## Task 6: `callJsonLLM` — non-fallback for caller-visible errors

**Files:**
- Modify: `src/lib/evi/llm-call.test.ts`

- [ ] **Step 1: Add tests verifying we do NOT retry for parse errors**

Append below the previous `describe` block:

```ts
describe('callJsonLLM — non-fallback paths', () => {
  it('does not fall back when MiMo returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not json at all' } }],
    });

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1); // no fallback
  });

  it('does not fall back on HTTP 400 (caller bug, not infrastructure)', async () => {
    const apiErr = Object.assign(new Error('Bad Request'), { status: 400 });
    mockCreate.mockRejectedValueOnce(apiErr);

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/Bad Request/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on HTTP 401 (auth issue, fallback would also fail)', async () => {
    const apiErr = Object.assign(new Error('Unauthorized'), { status: 401 });
    mockCreate.mockRejectedValueOnce(apiErr);

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/Unauthorized/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests — they should already pass**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: 14 tests PASS (the existing `isHardInfrastructureError` correctly returns false for parse errors and 4xx)

- [ ] **Step 3: Commit**

```bash
git add src/lib/evi/llm-call.test.ts
git commit -m "test(evi): verify callJsonLLM does not retry on caller-visible errors"
```

---

## Task 7: `callJsonLLM` — missing API key handling

**Files:**
- Modify: `src/lib/evi/llm-call.test.ts`
- Modify: `src/lib/evi/llm-call.ts`

- [ ] **Step 1: Add three failing tests for key-handling**

Append below the previous `describe`:

```ts
describe('callJsonLLM — missing API keys', () => {
  it('falls back to Minimax when XIAOMI_MIMO_API_KEY is missing', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('MINIMAX_API_KEY', 'minimax-test-key');
    // XIAOMI_MIMO_API_KEY deliberately not set

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"from":"minimax"}' } }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expect(mockCreate).toHaveBeenCalledTimes(1); // primary never reached the SDK
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].baseURL).toBe('https://api.minimax.io/v1');
  });

  it('throws clear error when both keys missing', async () => {
    vi.unstubAllEnvs();
    // Neither key set

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/Both providers failed/);
  });

  it('still completes if MIMO key is present but Minimax key is missing (no fallback needed)', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('XIAOMI_MIMO_API_KEY', 'mimo-test-key');

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('mimo');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: The first test ("falls back when XIAOMI_MIMO_API_KEY missing") FAILS because `is not set` is not currently classified as a hard infrastructure error.

- [ ] **Step 3: Extend `isHardInfrastructureError` to include missing-key**

In `src/lib/evi/llm-call.ts`, find the `isHardInfrastructureError` function. Add this branch before `return false`:

```ts
  // Missing API key on a provider — try the other one.
  if (/is not set/i.test(err.message)) return true;
```

The full function body becomes:

```ts
function isHardInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  if (/abort/i.test(err.message)) return true;
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    if (status === 429 || status >= 500) return true;
  }
  if (/(ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network)/i.test(err.message)) {
    return true;
  }
  if (/returned empty response|returned only thinking/i.test(err.message)) {
    return true;
  }
  // Missing API key on a provider — try the other one.
  if (/is not set/i.test(err.message)) return true;
  return false;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/evi/llm-call.test.ts`
Expected: 17 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evi/llm-call.ts src/lib/evi/llm-call.test.ts
git commit -m "feat(evi): treat missing API key as fallback trigger in callJsonLLM"
```

---

## Task 8: Refactor `parseTrip` to use `callJsonLLM`

**Files:**
- Modify: `src/lib/evi/minimax-client.ts`
- Modify: `src/lib/evi/minimax-client.test.ts`

- [ ] **Step 1: Replace `src/lib/evi/minimax-client.ts` body**

Full replacement (we keep the filename per spec §5; only internals change):

```ts
// src/lib/evi/minimax-client.ts
//
// eVi trip parser. Despite the file name, this delegates to callJsonLLM
// which uses MiMo Flash as primary and Minimax M2.7 as fallback. We keep
// the filename to avoid churning every import; rename is a follow-up.

import { MinimaxTripExtraction } from './types';
import type { MinimaxTripExtractionResult } from './types';
import { buildSystemPrompt } from './prompt';
import { callJsonLLM } from './llm-call';

interface AccumulatedParams {
  readonly start: string | null;
  readonly end: string | null;
  readonly vehicleBrand: string | null;
  readonly vehicleModel: string | null;
  readonly currentBattery: number | null;
}

interface ParseInput {
  readonly message: string;
  readonly history: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly vehicleListText: string;
  readonly accumulatedParams: AccumulatedParams | null;
}

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

- [ ] **Step 2: Update `src/lib/evi/minimax-client.test.ts`**

Replace the file with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallJsonLLM = vi.fn();
vi.mock('./llm-call', () => ({
  callJsonLLM: mockCallJsonLLM,
}));

import { parseTrip } from './minimax-client';

const VALID_EXTRACTION = {
  startLocation: null,
  endLocation: 'Đà Lạt',
  vehicleBrand: null,
  vehicleModel: null,
  currentBatteryPercent: null,
  isTripRequest: true,
  isStationSearch: false,
  stationSearchParams: null,
  isOutsideVietnam: false,
  missingFields: [],
  followUpQuestion: null,
  confidence: 0.9,
};

describe('parseTrip', () => {
  beforeEach(() => {
    mockCallJsonLLM.mockReset();
  });

  it('passes maxTokens=1024 to bound any thinking-model reasoning chain', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: VALID_EXTRACTION, provider: 'mimo' });

    await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(mockCallJsonLLM).toHaveBeenCalledOnce();
    const callArgs = mockCallJsonLLM.mock.calls[0][0] as { maxTokens: number };
    expect(callArgs.maxTokens).toBeLessThanOrEqual(1024);
  });

  it('returns parsed extraction on success', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: VALID_EXTRACTION, provider: 'mimo' });

    const result = await parseTrip({
      message: 'Đi Đà Lạt',
      history: [],
      vehicleListText: 'VinFast VF 8 (87.7 kWh, 471 km)',
      accumulatedParams: null,
    });

    expect(result.endLocation).toBe('Đà Lạt');
    expect(result.confidence).toBe(0.9);
  });

  it('tags caller as eVi-parse for log diagnostics', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: VALID_EXTRACTION, provider: 'mimo' });

    await parseTrip({
      message: 'test',
      history: [],
      vehicleListText: 'VinFast VF 8',
      accumulatedParams: null,
    });

    const callArgs = mockCallJsonLLM.mock.calls[0][0] as { callerTag: string };
    expect(callArgs.callerTag).toBe('eVi-parse');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/evi/minimax-client.test.ts src/lib/evi/llm-call.test.ts`
Expected: All PASS

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evi/minimax-client.ts src/lib/evi/minimax-client.test.ts
git commit -m "refactor(evi): parseTrip uses callJsonLLM (mimo primary)"
```

---

## Task 9: Refactor `generateSuggestions` to use `callJsonLLM`

**Files:**
- Modify: `src/lib/evi/suggestions-client.ts`
- Modify: `src/lib/evi/suggestions-client.test.ts`

- [ ] **Step 1: Replace `src/lib/evi/suggestions-client.ts` body**

Full replacement:

```ts
// src/lib/evi/suggestions-client.ts
//
// Generates 3 short follow-up question chips for the eVi UI based on
// the recent conversation. Tight 3s budget — chips are nice-to-have,
// so we silently return [] on any failure.

import { z } from 'zod';
import { callJsonLLM } from './llm-call';

interface ConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

interface TripContext {
  readonly start: string | null;
  readonly end: string | null;
  readonly vehicleName: string | null;
  readonly currentBattery: number | null;
  readonly isComplete: boolean;
}

const SuggestionsSchema = z.object({
  suggestions: z.array(z.string()).min(1).max(3),
});

function buildSuggestionsPrompt(
  messages: readonly ConversationMessage[],
  tripContext: TripContext | null,
): string {
  const conversationHistory = messages
    .map(m => `${m.role === 'user' ? 'User' : 'eVi'}: ${m.content}`)
    .join('\n');

  const contextParts: string[] = [];
  if (tripContext) {
    if (tripContext.start) contextParts.push(`Điểm đi: ${tripContext.start}`);
    if (tripContext.end) contextParts.push(`Điểm đến: ${tripContext.end}`);
    if (tripContext.vehicleName) contextParts.push(`Xe: ${tripContext.vehicleName}`);
    if (tripContext.currentBattery != null) contextParts.push(`Pin: ${tripContext.currentBattery}%`);
    if (tripContext.isComplete) contextParts.push('Trạng thái: Đã đủ thông tin');
  }

  const tripContextText = contextParts.length > 0
    ? contextParts.join('\n')
    : 'Chưa có thông tin chuyến đi';

  return `You are eVi, an EV road trip assistant for Vietnam.

Given this conversation:
${conversationHistory}

Trip context so far:
${tripContextText}

Generate exactly 3 short follow-up questions (in Vietnamese) the user would most likely want to ask next. Each question should be:
- Contextually relevant to what was just discussed
- Actionable (leads to useful information)
- Short enough to fit in a button (max 40 characters Vietnamese)

Return as JSON: {"suggestions": ["question1", "question2", "question3"]}`;
}

export async function generateSuggestions(
  messages: readonly ConversationMessage[],
  tripContext: TripContext | null,
): Promise<readonly string[]> {
  const systemPrompt = buildSuggestionsPrompt(messages, tripContext);

  try {
    const { json } = await callJsonLLM({
      systemPrompt,
      userMessages: [{ role: 'user', content: 'Generate the chips now.' }],
      maxTokens: 512,
      temperature: 0.3,
      primaryTimeoutMs: 3000,
      fallbackTimeoutMs: 3000,
      callerTag: 'eVi-suggestions',
    });

    const validated = SuggestionsSchema.safeParse(json);
    if (!validated.success) {
      console.error('[eVi-suggestions] response validation failed:', validated.error.message);
      return [];
    }

    return validated.data.suggestions
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= 40)
      .slice(0, 3);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[eVi-suggestions] failed silently:', message);
    return [];
  }
}
```

- [ ] **Step 2: Replace `src/lib/evi/suggestions-client.test.ts` body**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallJsonLLM = vi.fn();
vi.mock('./llm-call', () => ({
  callJsonLLM: mockCallJsonLLM,
}));

import { generateSuggestions } from './suggestions-client';

const sampleMessages = [
  { role: 'user' as const, content: 'Đi Đà Lạt từ Sài Gòn' },
  { role: 'assistant' as const, content: 'Bạn đang lái xe gì?' },
];

const sampleContext = {
  start: 'Sài Gòn',
  end: 'Đà Lạt',
  vehicleName: null,
  currentBattery: null,
  isComplete: false,
};

describe('generateSuggestions', () => {
  beforeEach(() => {
    mockCallJsonLLM.mockReset();
  });

  it('returns parsed suggestions on success', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: { suggestions: ['Pin còn bao nhiêu?', 'Trạm sạc gần nhất?', 'Thời gian sạc?'] },
      provider: 'mimo',
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual(['Pin còn bao nhiêu?', 'Trạm sạc gần nhất?', 'Thời gian sạc?']);
  });

  it('filters out suggestions longer than 40 chars', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: {
        suggestions: [
          'Short one',
          'This is a very long suggestion that definitely exceeds the 40 character limit imposed',
          'Another short',
        ],
      },
      provider: 'mimo',
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual(['Short one', 'Another short']);
  });

  it('returns empty array on validation failure', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: { wrongShape: true },
      provider: 'mimo',
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual([]);
  });

  it('returns empty array on callJsonLLM failure (silent degradation)', async () => {
    mockCallJsonLLM.mockRejectedValueOnce(new Error('Both providers failed'));

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual([]);
  });

  it('passes 3000ms primary timeout (chips are tight)', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: { suggestions: ['a', 'b', 'c'] },
      provider: 'mimo',
    });

    await generateSuggestions(sampleMessages, sampleContext);
    const callArgs = mockCallJsonLLM.mock.calls[0][0] as { primaryTimeoutMs: number };
    expect(callArgs.primaryTimeoutMs).toBe(3000);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/evi/suggestions-client.test.ts`
Expected: 5 tests PASS

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evi/suggestions-client.ts src/lib/evi/suggestions-client.test.ts
git commit -m "refactor(evi): generateSuggestions uses callJsonLLM (mimo primary)"
```

---

## Task 10: Refactor narrative route + bump `maxDuration`

**Files:**
- Modify: `src/app/api/route/narrative/route.ts`
- Modify: `src/app/api/route/narrative/route.test.ts`

- [ ] **Step 1: Read existing test file to learn its mocking style**

Run: `cat src/app/api/route/narrative/route.test.ts | head -60`

This file mocks `openai` directly today. We will switch it to mock `@/lib/evi/llm-call` instead.

- [ ] **Step 2: Replace `src/app/api/route/narrative/route.ts`**

Full replacement:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, routeLimiter } from '@/lib/rate-limit';
import { callJsonLLM } from '@/lib/evi/llm-call';

// Worst case = primaryTimeoutMs (15s, MiMo Flash) + fallbackTimeoutMs (50s,
// M2.7) + a few seconds of platform overhead. 70s leaves headroom.
export const maxDuration = 70;

const chargingStopSchema = z.object({
  stationName: z.string().min(1).max(200),
  address: z.string().max(500),
  distanceFromStartKm: z.number().nonnegative(),
  chargingTimeMin: z.number().nonnegative(),
  arrivalBattery: z.number().min(0).max(100),
  departureBattery: z.number().min(0).max(100),
});

const narrativeRequestSchema = z.object({
  tripId: z.string().min(1).max(100).optional(),
  startAddress: z.string().min(1).max(500),
  endAddress: z.string().min(1).max(500),
  totalDistanceKm: z.number().positive(),
  totalDurationMin: z.number().positive(),
  chargingStops: z.array(chargingStopSchema).max(20),
});

export type NarrativeRequest = z.infer<typeof narrativeRequestSchema>;

export interface NarrativeResponse {
  readonly overview: string | null;
  readonly narrative: string | null;
  readonly error?: string;
}

const narrativeResponseSchema = z.object({
  overview: z.string().min(1),
  narrative: z.string().min(1),
});

function buildNarrativePrompt(data: NarrativeRequest): string {
  const stopsText = data.chargingStops.length === 0
    ? 'Không cần sạc dọc đường.'
    : data.chargingStops.map((stop, i) =>
      `  ${i + 1}. ${stop.stationName} (${stop.address}) — km ${Math.round(stop.distanceFromStartKm)}, ` +
      `sạc ${Math.round(stop.chargingTimeMin)} phút, pin ${Math.round(stop.arrivalBattery)}% → ${Math.round(stop.departureBattery)}%`
    ).join('\n');

  return `You are a helpful EV road trip co-pilot for Vietnam. Generate a driver-friendly route briefing in Vietnamese.

Route details:
- Start: ${data.startAddress}
- Destination: ${data.endAddress}
- Total distance: ${data.totalDistanceKm} km
- Estimated driving time: ${data.totalDurationMin} minutes
- Charging stops:
${stopsText}

Generate a warm, conversational route briefing that reads like a co-pilot talking to the driver. Include:
1. A 2-3 sentence overview of the journey
2. Key milestones along the way (major cities, provinces passed through)
3. Where and when to charge (station names, expected battery levels)
4. Practical notes (estimated arrival time, total charging time)

Format:
- First paragraph: Quick overview (this becomes the collapsed preview)
- Second paragraph onward: Detailed narrative

Keep it concise but informative. Use Vietnamese naturally.
Return as JSON: {"overview": "2-3 sentence summary", "narrative": "full detailed narrative"}`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`narrative:${ip}`, 10, 60_000, routeLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        overview: null,
        narrative: null,
        error: 'Too many requests. Please try again later.',
      } satisfies NarrativeResponse,
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { overview: null, narrative: null, error: 'Invalid JSON body' } satisfies NarrativeResponse,
      { status: 400 },
    );
  }

  const parsed = narrativeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        overview: null,
        narrative: null,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
      } satisfies NarrativeResponse,
      { status: 400 },
    );
  }

  try {
    const prompt = buildNarrativePrompt(parsed.data);

    const { json, provider } = await callJsonLLM({
      systemPrompt: 'You are a Vietnamese EV trip assistant. Always respond with valid JSON.',
      userMessages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.4,
      primaryTimeoutMs: 15_000,
      fallbackTimeoutMs: 50_000,
      callerTag: 'narrative',
    });

    if (provider === 'minimax') {
      console.warn('[narrative] served via Minimax fallback');
    }

    const result = narrativeResponseSchema.safeParse(json);
    if (!result.success) {
      throw new Error('AI response missing overview or narrative fields');
    }

    return NextResponse.json({
      overview: result.data.overview,
      narrative: result.data.narrative,
    } satisfies NarrativeResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[narrative] AI generation failed:', message);

    if (/Both providers failed/i.test(message)) {
      return NextResponse.json(
        { overview: null, narrative: null, error: 'AI service unavailable' } satisfies NarrativeResponse,
        { status: 503 },
      );
    }

    return NextResponse.json(
      { overview: null, narrative: null, error: 'Failed to generate route narrative' } satisfies NarrativeResponse,
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Update `src/app/api/route/narrative/route.test.ts` mocks**

Replace lines 1-17 (the imports + openai mock) with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  routeLimiter: null,
}));

const mockCallJsonLLM = vi.fn();
vi.mock('@/lib/evi/llm-call', () => ({
  callJsonLLM: mockCallJsonLLM,
}));

import { POST } from './route';
import { checkRateLimit } from '@/lib/rate-limit';
```

Then for any test that previously did `mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '...' } }] })`, change to:

```ts
mockCallJsonLLM.mockResolvedValueOnce({
  json: { overview: '...', narrative: '...' },
  provider: 'mimo',
});
```

For tests that previously triggered errors (e.g. `mockCreate.mockRejectedValueOnce(new Error('...'))`), change to:

```ts
mockCallJsonLLM.mockRejectedValueOnce(new Error('Both providers failed. mimo: ... minimax: ...'));
```

If the existing test expects status 503 from `MINIMAX_API_KEY is not set`, update it to match the new "AI service unavailable" message and the `Both providers failed` error string.

Replace `mockCreate` references throughout the file with `mockCallJsonLLM` and adjust the `.mock*Once` calls accordingly.

Also reset the mock in `beforeEach`:

```ts
beforeEach(() => {
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 });
  mockCallJsonLLM.mockReset();
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/api/route/narrative/route.test.ts`
Expected: All PASS. If any test fails because it asserted on internal OpenAI call args (model name, content stripping), delete that assertion — it now belongs in `llm-call.test.ts`.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/route/narrative/route.ts src/app/api/route/narrative/route.test.ts
git commit -m "refactor(narrative): use callJsonLLM with mimo primary, bump maxDuration to 70"
```

---

## Task 11: Final verification

**Files:** none modified — verification only

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm test`
Expected: All tests PASS. The baseline is 813+ tests across 63+ files (per `CLAUDE.md`); we added a new `llm-call.test.ts` (17 tests), modified 3 test files, so the new total should be **826+ tests** with no regressions.

If any unrelated test fails (locale-keys, etc.), investigate before continuing — do not commit.

- [ ] **Step 2: Run the production build**

Run: `npx next build`
Expected: PASS — no TypeScript errors, build artifacts generated successfully.

- [ ] **Step 3: Manual smoke test (local dev)**

Add `XIAOMI_MIMO_API_KEY=<a real MiMo key>` to `.env.local` (alongside existing `MINIMAX_API_KEY`).

Run: `npm run dev`

In the browser:
1. Open eVi chat. Send: `"đi Đà Lạt từ Sài Gòn cuối tuần với VinFast VF 8"`. Confirm:
   - Browser DevTools → Network shows `/api/evi/parse` returns under ~5s.
   - eVi extracts the trip correctly.
   - No `[llm-call]` warnings in the server console (means MiMo succeeded).
2. After parsing completes, suggestion chips appear within ~3s.
3. Run a full trip plan (Sài Gòn → Đà Lạt with VF 8). Confirm the narrative briefing appears in under ~10s (vs the prior 30-50s baseline).

If any of these flows show a `[llm-call] ... falling back to minimax` warning, MiMo is degrading on real traffic — investigate before deploying.

- [ ] **Step 4: Document smoke results inline**

Edit the spec doc `docs/specs/2026-05-04-mimo-primary-minimax-fallback-design.md` and append a "Smoke test results 2026-05-04" subsection under §9 with the observed latencies for each of the three flows.

- [ ] **Step 5: Commit smoke notes**

```bash
git add docs/specs/2026-05-04-mimo-primary-minimax-fallback-design.md
git commit -m "docs(specs): record MiMo smoke-test latencies"
```

- [ ] **Step 6: Hand off to Duy**

Tell Duy:
1. Add `XIAOMI_MIMO_API_KEY` to Vercel (preview + production environments).
2. Deploy to preview branch, run §7 manual smokes against preview URL.
3. Merge to main when satisfied.
4. Watch Vercel logs for `[llm-call]` warnings the first 24h post-deploy.

---

## Self-review notes

- **Spec coverage**: §2 architecture → Tasks 2-4. §5.2 timeout strategy → embedded in Tasks 8-10 with the exact `primaryTimeoutMs`/`fallbackTimeoutMs` values from the spec table. §5.3 caller refactor pattern → Tasks 8/9/10. §6 env vars → Task 1. §7 tests → Tasks 3-7 (orchestrator) + Tasks 8/9/10 (caller mocks). §9 rollout → Task 11 hand-off step.
- **Type consistency**: `callJsonLLM` signature defined in Task 3 matches caller usage in Tasks 8/9/10. `LLMProviderName` type used consistently. `provider: 'mimo' | 'minimax'` literal aligns across `llm-providers.ts`, `llm-call.ts`, and the three callers' "served via Minimax fallback" log lines.
- **No placeholders**: every code block is complete and runnable. No "TODO" or "implement later". Test cases include actual mocked content and exact expected assertions.
- **Frequent commits**: 11 task-level commits, each scoped to one concern. Easy to revert individually if a step misbehaves.
