// src/lib/evi/suggestions-client.ts
//
// Generates 3 short follow-up question chips for the eVi UI based on
// the recent conversation. Tight 3s budget — chips are nice-to-have,
// so we silently return [] on any failure (LLMSchemaError,
// LLMUnavailableError, LLMAbortedError all collapse to []).
// See docs/adr/0002-llm-call-module.md.

import { z } from 'zod';
import { callLLM } from './llm-module';

type Locale = 'vi' | 'en';

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
  locale: Locale,
): string {
  const conversationHistory = messages
    .map(m => `${m.role === 'user' ? 'User' : 'eVi'}: ${m.content}`)
    .join('\n');

  const contextParts: string[] = [];
  if (tripContext) {
    if (tripContext.start) contextParts.push(`${locale === 'vi' ? 'Điểm đi' : 'Start'}: ${tripContext.start}`);
    if (tripContext.end) contextParts.push(`${locale === 'vi' ? 'Điểm đến' : 'Destination'}: ${tripContext.end}`);
    if (tripContext.vehicleName) contextParts.push(`${locale === 'vi' ? 'Xe' : 'Vehicle'}: ${tripContext.vehicleName}`);
    if (tripContext.currentBattery != null) contextParts.push(`${locale === 'vi' ? 'Pin' : 'Battery'}: ${tripContext.currentBattery}%`);
    if (tripContext.isComplete) {
      contextParts.push(locale === 'vi' ? 'Trạng thái: Đã đủ thông tin' : 'Status: All info collected');
    }
  }

  const noContextText = locale === 'vi' ? 'Chưa có thông tin chuyến đi' : 'No trip info yet';
  const tripContextText = contextParts.length > 0 ? contextParts.join('\n') : noContextText;

  // MiMo Flash is a Chinese-trained model and tends to leak Chinese characters
  // into Vietnamese output (observed in prod 2026-05-04). The explicit guard
  // forces single-language output. M2.7 fallback already respects this naturally.
  const langName = locale === 'vi' ? 'Vietnamese' : 'English';
  const langGuard = locale === 'vi'
    ? 'Quan trọng: Phản hồi PHẢI hoàn toàn bằng tiếng Việt. KHÔNG dùng ký tự tiếng Trung hoặc tiếng Anh trong câu hỏi.'
    : 'Important: Response MUST be entirely in English. Do NOT mix in Vietnamese or Chinese characters.';

  return `You are eVi, an EV road trip assistant for Vietnam.

Given this conversation:
${conversationHistory}

Trip context so far:
${tripContextText}

Generate exactly 3 short follow-up questions (in ${langName}) the user would most likely want to ask next. Each question should be:
- Contextually relevant to what was just discussed
- Actionable (leads to useful information)
- Short enough to fit in a button (max 40 characters)

${langGuard}

Return as JSON: {"suggestions": ["question1", "question2", "question3"]}`;
}

export async function generateSuggestions(
  messages: readonly ConversationMessage[],
  tripContext: TripContext | null,
  locale: Locale = 'vi',
): Promise<readonly string[]> {
  const systemPrompt = buildSuggestionsPrompt(messages, tripContext, locale);

  try {
    const result = await callLLM({
      schema: SuggestionsSchema,
      system: systemPrompt,
      user: 'Generate the chips now.',
      // 2048 instead of the Module default: M2.7's chain-of-thought routinely
      // runs 1-2k tokens; a smaller cap truncates it before the JSON is emitted,
      // causing silent empty chips on every fallback. MiMo Flash is non-thinking
      // and uses only what it needs, so the bigger ceiling has no perf cost on
      // the primary path.
      maxTokens: 2048,
      timeoutMs: 3000,
    });

    return result.suggestions
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= 40)
      .slice(0, 3);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[eVi-suggestions] failed silently:', message);
    return [];
  }
}
