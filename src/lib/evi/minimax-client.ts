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
