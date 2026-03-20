import OpenAI from 'openai';
import { MinimaxTripExtraction } from './types';
import type { MinimaxTripExtractionResult } from './types';
import { buildSystemPrompt } from './prompt';

const MODEL = 'MiniMax-M2.7';

function getClient(): OpenAI {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY is not set');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.minimax.io/v1',
  });
}

interface ParseInput {
  readonly message: string;
  readonly history: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly vehicleListText: string;
}

const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15_000;

export async function parseTrip(input: ParseInput): Promise<MinimaxTripExtractionResult> {
  const systemPrompt = buildSystemPrompt(input.vehicleListText);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...input.history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: input.message },
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await getClient().chat.completions.create(
        {
          model: MODEL,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 500,
        },
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) {
        throw new Error('Minimax returned empty response');
      }

      // MiniMax-M2.7 wraps responses in <think>...</think> tags — strip them
      const content = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
      if (!content) {
        throw new Error('Minimax returned only thinking tags, no JSON content');
      }

      const parsed = JSON.parse(content);
      return MinimaxTripExtraction.parse(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[eVi] Minimax attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);

      // Don't retry on non-retryable errors
      if (lastError.message.includes('MINIMAX_API_KEY is not set')) {
        throw lastError;
      }

      // Wait briefly before retrying (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error('Minimax call failed after retries');
}
