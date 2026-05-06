// src/lib/evi/minimax-client.ts
//
// eVi trip parser. Builds the system prompt + history-threaded user
// payload, then delegates to the deepened LLM Module (callLLM), which
// owns provider chain, response cleaning, schema validation, and
// telemetry. See docs/adr/0002-llm-call-module.md.

import { MinimaxTripExtraction } from './types';
import type { MinimaxTripExtractionResult } from './types';
import { buildSystemPrompt } from './prompt';
import { callLLM } from './llm-module';

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

// callLLM takes a single `user` string. Flatten conversation turns into
// labeled lines so multi-turn context survives the Seam without leaking
// chat-message shape into the Module.
function buildUserPayload(
  history: ParseInput['history'],
  message: string,
): string {
  if (history.length === 0) return message;
  const transcript = history.map(t => `${t.role}: ${t.content}`).join('\n');
  return `${transcript}\nuser: ${message}`;
}

export async function parseTrip(input: ParseInput): Promise<MinimaxTripExtractionResult> {
  return callLLM({
    schema: MinimaxTripExtraction,
    system: buildSystemPrompt(input.vehicleListText, input.accumulatedParams),
    user: buildUserPayload(input.history, input.message),
    maxTokens: 1024,
    timeoutMs: 8000,
  });
}
