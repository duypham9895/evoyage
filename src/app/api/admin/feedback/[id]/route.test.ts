import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock prisma BEFORE importing the route so the import picks up the mock.
const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

import { PATCH } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/feedback/feedback-id-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const PARAMS = { params: Promise.resolve({ id: 'feedback-id-1' }) };

beforeEach(() => {
  findUniqueMock.mockReset();
  updateMock.mockReset();
});

describe('PATCH /api/admin/feedback/[id]', () => {
  it('updates status and sets resolvedAt when transitioning to RESOLVED', async () => {
    findUniqueMock.mockResolvedValue({ status: 'NEW' });
    updateMock.mockResolvedValue({
      id: 'feedback-id-1',
      status: 'RESOLVED',
      resolvedAt: new Date('2026-05-24T10:00:00Z'),
      updatedAt: new Date('2026-05-24T10:00:00Z'),
    });

    const res = await PATCH(makeRequest({ status: 'RESOLVED' }), PARAMS);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe('RESOLVED');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'feedback-id-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('clears resolvedAt when moving back to NEW (state is no longer resolved)', async () => {
    findUniqueMock.mockResolvedValue({ status: 'RESOLVED' });
    updateMock.mockResolvedValue({
      id: 'feedback-id-1',
      status: 'NEW',
      resolvedAt: null,
      updatedAt: new Date(),
    });

    await PATCH(makeRequest({ status: 'NEW' }), PARAMS);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'NEW', resolvedAt: null }),
      }),
    );
  });

  it('leaves resolvedAt unchanged on CLOSED (audit trail of when it was resolved survives)', async () => {
    findUniqueMock.mockResolvedValue({ status: 'RESOLVED' });
    updateMock.mockResolvedValue({
      id: 'feedback-id-1',
      status: 'CLOSED',
      resolvedAt: new Date(),
      updatedAt: new Date(),
    });

    await PATCH(makeRequest({ status: 'CLOSED' }), PARAMS);

    const updateCall = updateMock.mock.calls[0]![0] as { data: { resolvedAt?: unknown } };
    expect(updateCall.data.resolvedAt).toBeUndefined();
  });

  it('returns 404 when the feedback row does not exist', async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ status: 'RESOLVED' }), PARAMS);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('not_found');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid status value', async () => {
    const res = await PATCH(makeRequest({ status: 'BANANA' }), PARAMS);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('invalid_body');
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await PATCH(makeRequest('{not json'), PARAMS);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('invalid_json');
  });

  it('returns 400 when body has no status field', async () => {
    const res = await PATCH(makeRequest({}), PARAMS);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('invalid_body');
  });
});
