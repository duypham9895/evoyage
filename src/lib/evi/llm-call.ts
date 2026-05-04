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
  } finally {
    clearTimeout(timer);
  }
}

export async function callJsonLLM(input: CallJsonLLMInput): Promise<CallJsonLLMResult> {
  const json = await callProvider(PRIMARY_PROVIDER, input, input.primaryTimeoutMs);
  return { json, provider: PRIMARY_PROVIDER.name };
}

// FALLBACK_PROVIDER is referenced here to prevent tree-shaking; Task 5 will
// wire it into the orchestration logic.
void FALLBACK_PROVIDER;
