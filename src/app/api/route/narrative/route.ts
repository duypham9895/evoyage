import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { checkRateLimit, getClientIp, routeLimiter } from '@/lib/rate-limit';

// ── Schema ──

const chargingStopSchema = z.object({
  stationName: z.string().min(1).max(200),
  address: z.string().max(500),
  distanceFromStartKm: z.number().nonnegative(),
  chargingTimeMin: z.number().nonnegative(),
  arrivalBattery: z.number().min(0).max(100),
  departureBattery: z.number().min(0).max(100),
});

const narrativeRequestSchema = z.object({
  tripId: z.string().min(1).max(100).optional(),
  startAddress: z.string().min(1).max(500),
  endAddress: z.string().min(1).max(500),
  totalDistanceKm: z.number().positive(),
  totalDurationMin: z.number().positive(),
  chargingStops: z.array(chargingStopSchema).max(20),
});

export type NarrativeRequest = z.infer<typeof narrativeRequestSchema>;

export interface NarrativeResponse {
  readonly overview: string | null;
  readonly narrative: string | null;
  readonly error?: string;
}

// ── AI Client ──

const MODEL = 'MiniMax-M2.7';
const REQUEST_TIMEOUT_MS = 10_000;

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

function buildNarrativePrompt(data: NarrativeRequest): string {
  const stopsText = data.chargingStops.length === 0
    ? 'Không cần sạc dọc đường.'
    : data.chargingStops.map((stop, i) =>
      `  ${i + 1}. ${stop.stationName} (${stop.address}) — km ${Math.round(stop.distanceFromStartKm)}, ` +
      `sạc ${Math.round(stop.chargingTimeMin)} phút, pin ${Math.round(stop.arrivalBattery)}% → ${Math.round(stop.departureBattery)}%`
    ).join('\n');

  return `You are a helpful EV road trip co-pilot for Vietnam. Generate a driver-friendly route briefing in Vietnamese.

Route details:
- Start: ${data.startAddress}
- Destination: ${data.endAddress}
- Total distance: ${data.totalDistanceKm} km
- Estimated driving time: ${data.totalDurationMin} minutes
- Charging stops:
${stopsText}

Generate a warm, conversational route briefing that reads like a co-pilot talking to the driver. Include:
1. A 2-3 sentence overview of the journey
2. Key milestones along the way (major cities, provinces passed through)
3. Where and when to charge (station names, expected battery levels)
4. Practical notes (estimated arrival time, total charging time)

Format:
- First paragraph: Quick overview (this becomes the collapsed preview)
- Second paragraph onward: Detailed narrative

Keep it concise but informative. Use Vietnamese naturally.
Return as JSON: {"overview": "2-3 sentence summary", "narrative": "full detailed narrative"}`;
}

// ── Handler ──

export async function POST(request: NextRequest) {
  // Rate limit: 10 req/min per IP
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`narrative:${ip}`, 10, 60_000, routeLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        overview: null,
        narrative: null,
        error: 'Too many requests. Please try again later.',
      } satisfies NarrativeResponse,
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { overview: null, narrative: null, error: 'Invalid JSON body' } satisfies NarrativeResponse,
      { status: 400 },
    );
  }

  const parsed = narrativeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        overview: null,
        narrative: null,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
      } satisfies NarrativeResponse,
      { status: 400 },
    );
  }

  // Call Minimax
  try {
    const prompt = buildNarrativePrompt(parsed.data);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await getClient().chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a Vietnamese EV trip assistant. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 1024,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Minimax returned empty response');
    }

    // Strip MiniMax thinking tags
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
    if (!content) {
      throw new Error('Minimax returned only thinking tags');
    }

    const result = JSON.parse(content);

    const narrativeResult = z.object({
      overview: z.string().min(1),
      narrative: z.string().min(1),
    }).safeParse(result);

    if (!narrativeResult.success) {
      throw new Error('AI response missing overview or narrative fields');
    }

    return NextResponse.json({
      overview: narrativeResult.data.overview,
      narrative: narrativeResult.data.narrative,
    } satisfies NarrativeResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[narrative] AI generation failed:', message);

    // Don't expose internal errors
    if (message.includes('MINIMAX_API_KEY is not set')) {
      return NextResponse.json(
        { overview: null, narrative: null, error: 'AI service not configured' } satisfies NarrativeResponse,
        { status: 503 },
      );
    }

    return NextResponse.json(
      { overview: null, narrative: null, error: 'Failed to generate route narrative' } satisfies NarrativeResponse,
      { status: 500 },
    );
  }
}
