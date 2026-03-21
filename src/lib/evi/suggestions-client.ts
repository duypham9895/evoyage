import OpenAI from 'openai';
import { z } from 'zod';

const MODEL = 'MiniMax-M2.7';
const REQUEST_TIMEOUT_MS = 3000;

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

// ── Input Types ──

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

// ── Response Schema ──

const SuggestionsSchema = z.object({
  suggestions: z.array(z.string()).min(1).max(3),
});

// ── Prompt Builder ──

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

// ── Main Function ──

export async function generateSuggestions(
  messages: readonly ConversationMessage[],
  tripContext: TripContext | null,
): Promise<readonly string[]> {
  const systemPrompt = buildSuggestionsPrompt(messages, tripContext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await getClient().chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: 'user', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 512,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      return [];
    }

    // MiniMax-M2.7 wraps responses in <think>...</think> tags — strip them
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    const validated = SuggestionsSchema.safeParse(parsed);

    if (!validated.success) {
      console.error('[eVi] Suggestions response validation failed:', validated.error.message);
      return [];
    }

    // Enforce max 40 chars per suggestion
    return validated.data.suggestions
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= 40)
      .slice(0, 3);
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);

    // Timeout is expected — return empty silently
    if (message.includes('abort')) {
      return [];
    }

    throw err;
  }
}
