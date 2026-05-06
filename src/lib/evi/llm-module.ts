import OpenAI from 'openai';
import type { z } from 'zod';
import { MIMO_PROVIDER, MINIMAX_PROVIDER, type LLMProvider } from './llm-providers';

export interface CallLLMInput<T> {
  readonly schema: z.ZodType<T>;
  readonly system: string;
  readonly user: string;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export class LLMSchemaError extends Error {
  readonly rawResponse: string;
  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = 'LLMSchemaError';
    this.rawResponse = rawResponse;
  }
}

export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMUnavailableError';
  }
}

export class LLMAbortedError extends Error {
  constructor(message = 'LLM call aborted by caller') {
    super(message);
    this.name = 'LLMAbortedError';
  }
}

const PROVIDER_CHAIN: ReadonlyArray<LLMProvider> = [MIMO_PROVIDER, MINIMAX_PROVIDER];

function isInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  // Network / TCP errors. The OpenAI SDK wraps these with no `.status`, so
  // pattern-match on the message. These are the same patterns the legacy
  // callJsonLLM treated as fallback-eligible (regression caught after PR 4/4).
  if (/(ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network)/i.test(err.message)) {
    return true;
  }
  // Empty / quirk-only content from primary — try the next provider.
  if (/returned empty response|returned only thinking/i.test(err.message)) return true;
  // Missing API key on a provider — try the other one rather than crashing.
  if (/is not set/i.test(err.message)) return true;
  return false;
}

async function callProvider<T>(provider: LLMProvider, input: CallLLMInput<T>): Promise<T> {
  const apiKey = process.env[provider.envVar]?.trim();
  if (!apiKey) {
    throw new Error(`${provider.envVar} is not set`);
  }
  const client = new OpenAI({ apiKey, baseURL: provider.baseURL });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const start = performance.now();
  let response;
  try {
    response = await client.chat.completions.create(
      {
        model: provider.defaultModel,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        response_format: { type: 'json_object' },
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: 0.1,
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Math.round(performance.now() - start);

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error(`${provider.name} returned empty response`);
  }
  const cleaned = stripProviderQuirks(rawContent);
  if (!cleaned) {
    throw new Error(`${provider.name} returned only thinking tags / fences`);
  }

  const parsed = input.schema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    console.error(`[llm] provider=${provider.name} schema_error=${parsed.error.message} latency_ms=${latencyMs}`);
    throw new LLMSchemaError(parsed.error.message, rawContent);
  }

  const tokens = (response as { usage?: { total_tokens?: number } }).usage?.total_tokens;
  const tokenSuffix = typeof tokens === 'number' ? ` tokens=${tokens}` : '';
  console.log(`[llm] provider=${provider.name} latency_ms=${latencyMs}${tokenSuffix} schema=ok`);
  return parsed.data;
}

// M2.7 wraps responses in two layers we peel off before JSON.parse:
// a <think>...</think> reasoning block (M2.7) and a markdown ```json
// fence (returned even when response_format is json_object — observed
// in prod 2026-05-04). MiMo Flash is non-thinking, but we keep the
// strip defensively in case Xiaomi adds a thinking-Flash variant.
function stripProviderQuirks(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .replace(/^\s*```(?:json)?\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
}

export async function callLLM<T>(input: CallLLMInput<T>): Promise<T> {
  if (input.signal?.aborted) throw new LLMAbortedError();

  let lastError: unknown;
  for (let i = 0; i < PROVIDER_CHAIN.length; i++) {
    const provider = PROVIDER_CHAIN[i];
    if (input.signal?.aborted) throw new LLMAbortedError();
    try {
      return await callProvider(provider, input);
    } catch (e) {
      if (!isInfrastructureError(e)) throw e;
      lastError = e;
      const next = PROVIDER_CHAIN[i + 1];
      if (next) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[llm] provider=${provider.name} failed=${msg} — falling back to ${next.name}`);
      }
    }
  }
  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[llm] all_providers_failed last=${lastMessage}`);
  throw new LLMUnavailableError(`All LLM providers exhausted. Last error: ${lastMessage}`);
}
