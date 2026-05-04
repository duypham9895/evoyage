import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, routeLimiter } from '@/lib/rate-limit';
import { callJsonLLM } from '@/lib/evi/llm-call';

// Worst case = primaryTimeoutMs (15s, MiMo Flash) + fallbackTimeoutMs (50s,
// M2.7) + a few seconds of platform overhead. 70s leaves headroom.
export const maxDuration = 70;

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

const narrativeResponseSchema = z.object({
  overview: z.string().min(1),
  narrative: z.string().min(1),
});

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

export async function POST(request: NextRequest) {
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

  try {
    const prompt = buildNarrativePrompt(parsed.data);

    const { json, provider } = await callJsonLLM({
      systemPrompt: 'You are a Vietnamese EV trip assistant. Always respond with valid JSON.',
      userMessages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.4,
      primaryTimeoutMs: 15_000,
      fallbackTimeoutMs: 50_000,
      callerTag: 'narrative',
    });

    if (provider === 'minimax') {
      console.warn('[narrative] served via Minimax fallback');
    }

    const result = narrativeResponseSchema.safeParse(json);
    if (!result.success) {
      throw new Error('AI response missing overview or narrative fields');
    }

    return NextResponse.json({
      overview: result.data.overview,
      narrative: result.data.narrative,
    } satisfies NarrativeResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[narrative] AI generation failed:', message);

    if (/Both providers failed/i.test(message)) {
      return NextResponse.json(
        { overview: null, narrative: null, error: 'AI service unavailable' } satisfies NarrativeResponse,
        { status: 503 },
      );
    }

    return NextResponse.json(
      { overview: null, narrative: null, error: 'Failed to generate route narrative' } satisfies NarrativeResponse,
      { status: 500 },
    );
  }
}
