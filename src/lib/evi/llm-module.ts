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
  return false;
}

async function callProvider<T>(provider: LLMProvider, input: CallLLMInput<T>): Promise<T> {
  const apiKey = process.env[provider.envVar]!;
  const client = new OpenAI({ apiKey, baseURL: provider.baseURL });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

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

  const content = response.choices[0]!.message!.content!;
  const parsed = input.schema.safeParse(JSON.parse(stripProviderQuirks(content)));
  if (!parsed.success) {
    throw new LLMSchemaError(parsed.error.message, content);
  }
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
  for (const provider of PROVIDER_CHAIN) {
    if (input.signal?.aborted) throw new LLMAbortedError();
    try {
      return await callProvider(provider, input);
    } catch (e) {
      if (!isInfrastructureError(e)) throw e;
      lastError = e;
    }
  }
  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new LLMUnavailableError(`All LLM providers exhausted. Last error: ${lastMessage}`);
}
