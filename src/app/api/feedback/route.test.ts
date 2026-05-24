/**
 * Integration tests for POST /api/feedback.
 *
 * Complements `src/lib/feedback/schema.test.ts` (pure Zod validation) by
 * covering the wired-up endpoint: rate limit → JSON parse → schema →
 * honeypot → timing → Prisma create → Resend email handoff.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

const createMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { feedback: { create: (...a: unknown[]) => createMock(...a) } },
}));
vi.mock('@/lib/feedback/email', () => ({
  sendFeedbackEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

import { POST } from './route';

const VALID = {
  category: 'REPORT_ISSUE',
  description: 'A valid description with enough characters',
};

function makeRequest(body: unknown, opts: { ip?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.ip) headers.set('x-vercel-forwarded-for', opts.ip);
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  createMock.mockReset();
  sendEmailMock.mockReset();
  createMock.mockResolvedValue({ id: 'feedback-id-1' });
  sendEmailMock.mockResolvedValue(undefined);
  __resetRateLimitForTests();
});

describe('POST /api/feedback', () => {
  it('creates the row and fires email notification on success', async () => {
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: 'feedback-id-1' });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackId: 'feedback-id-1',
        category: 'REPORT_ISSUE',
        description: VALID.description,
      }),
    );
  });

  it('hashes the client IP with SHA-256 before persisting (no raw IP in DB)', async () => {
    await POST(makeRequest(VALID, { ip: '203.0.113.42' }));

    const writeCall = createMock.mock.calls[0]![0] as { data: { ipHash: string } };
    expect(writeCall.data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    // SHA-256 of '203.0.113.42' computed offline:
    expect(writeCall.data.ipHash).not.toContain('203.0.113.42');
  });

  it('persists imageUrl when provided', async () => {
    const url = 'https://abc.public.blob.vercel-storage.com/feedback/2026-05-24/x.jpg';
    await POST(makeRequest({ ...VALID, imageUrl: url }));

    const writeCall = createMock.mock.calls[0]![0] as { data: { imageUrl: string | null } };
    expect(writeCall.data.imageUrl).toBe(url);
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 400 on Zod-invalid body and surfaces issue details', async () => {
    const res = await POST(makeRequest({ category: 'BANANA', description: 'short' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(Array.isArray(data.details)).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects imageUrl from a non-Vercel-Blob host (anti-shortener-abuse)', async () => {
    const res = await POST(makeRequest({ ...VALID, imageUrl: 'https://evil.example.com/img.jpg' }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('honeypot — accepts (201) but does not write to DB', async () => {
    const res = await POST(makeRequest({ ...VALID, honeypot: 'bot-was-here' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: 'ok' });
    expect(createMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('timing check — too-fast submit is silently accepted but not persisted', async () => {
    // formOpenedAt 100 ms ago — under the 3 s MIN_SUBMIT_DELAY_MS
    const res = await POST(makeRequest({ ...VALID, formOpenedAt: Date.now() - 100 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('ok');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('timing check — passes when formOpenedAt is older than 3 s', async () => {
    const res = await POST(makeRequest({ ...VALID, formOpenedAt: Date.now() - 5000 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('feedback-id-1');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when Prisma create throws', async () => {
    createMock.mockRejectedValueOnce(new Error('connection lost'));
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('still returns 201 when sendFeedbackEmail throws (DB write is the primary contract)', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: 'feedback-id-1' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('returns 429 after FEEDBACK_RATE_LIMIT submissions in the window', async () => {
    // FEEDBACK_RATE_LIMIT = 5 submissions/hour
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest(VALID, { ip: '4.4.4.4' }));
      expect(ok.status, `submission ${i + 1}`).toBe(201);
    }
    const blocked = await POST(makeRequest(VALID, { ip: '4.4.4.4' }));
    expect(blocked.status).toBe(429);
    const data = await blocked.json();
    expect(data.success).toBe(false);
  });

  it('rate limit is per-IP — different IPs share no bucket', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest(VALID, { ip: '6.6.6.6' }));
    }
    const fresh = await POST(makeRequest(VALID, { ip: '7.7.7.7' }));
    expect(fresh.status).toBe(201);
  });
});
