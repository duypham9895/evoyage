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
    const { json, provider } = await callJsonLLM({
      systemPrompt,
      userMessages: [{ role: 'user', content: 'Generate the chips now.' }],
      maxTokens: 512,
      temperature: 0.3,
      primaryTimeoutMs: 3000,
      fallbackTimeoutMs: 3000,
      callerTag: 'eVi-suggestions',
    });

    if (provider === 'minimax') {
      console.warn('[eVi-suggestions] served via Minimax fallback');
    }

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
