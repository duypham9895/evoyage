import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, eviLimiter } from '@/lib/rate-limit';
import { generateSuggestions } from '@/lib/evi/suggestions-client';

export const maxDuration = 10;

// ── Request Schema ──

const SuggestionsRequest = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(500),
  })).min(1).max(10),
  tripContext: z.object({
    start: z.string().nullable().default(null),
    end: z.string().nullable().default(null),
    vehicleName: z.string().nullable().default(null),
    currentBattery: z.number().nullable().default(null),
    isComplete: z.boolean().default(false),
  }).nullable().default(null),
});

export type SuggestionsRequestData = z.infer<typeof SuggestionsRequest>;

// ── Response Type ──

export interface SuggestionsResponse {
  readonly suggestions: readonly string[];
  readonly error: string | null;
}

// ── Handler ──

export async function POST(request: NextRequest): Promise<NextResponse<SuggestionsResponse>> {
  // Rate limit (same bucket as parse)
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`evi:${ip}`, 20, 60_000, eviLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { suggestions: [], error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  // Validate input
  const body = await request.json().catch(() => null);
  const parsed = SuggestionsRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { suggestions: [], error: 'Invalid request' },
      { status: 400 },
    );
  }

  const { messages, tripContext } = parsed.data;

  try {
    const suggestions = await generateSuggestions(messages, tripContext);
    return NextResponse.json({ suggestions, error: null });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[eVi] Suggestions generation failed:', errorMessage);
    return NextResponse.json({ suggestions: [], error: null });
  }
}
