import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { sendFeedbackEmail } from './email';
import { prisma } from '@/lib/prisma';

const ORIGINAL_FETCH = global.fetch;

describe('sendFeedbackEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.FEEDBACK_EMAIL_TO = 'pm@example.com';
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    delete process.env.RESEND_API_KEY;
    delete process.env.FEEDBACK_EMAIL_TO;
  });

  it('includes a plain-text body so Resend does not auto-generate (which mangles URL `=NN` in QP)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendFeedbackEmail({
      feedbackId: 'test-id',
      category: 'GENERAL_FEEDBACK',
      description: 'sample feedback',
      pageUrl: 'https://evoyage.duypham.me/plan?slat=10.65&slng=106.58&elat=11.91&elng=108.46&vid=vf8-plus',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe('string');
    // URL `=NN` separators must be present verbatim — Resend will QP-encode
    // them to `=3D` on the wire, recipient decodes back to `=`. The bug we
    // are fixing is the missing text body that triggered auto-generation
    // with bare `=` that the recipient mis-decoded as control bytes.
    expect(body.text).toContain('slat=10.65');
    expect(body.text).toContain('slng=106.58');
    expect(body.text).toContain('elat=11.91');
    expect(body.text).toContain('elng=108.46');
    expect(body.text).toContain('vid=vf8-plus');
  });

  it('includes the description, category label, and feedback ID in the text body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendFeedbackEmail({
      feedbackId: 'cmtest123',
      category: 'REPORT_ISSUE',
      description: 'Something broke when I clicked the share button',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.text).toContain('cmtest123');
    expect(body.text).toContain('Something broke when I clicked the share button');
    // Bug category gets the [Khẩn cấp] urgent prefix in the subject — text body
    // should at least contain the category label
    expect(body.text).toMatch(/Báo cáo lỗi/);
  });

  it('bounds the Resend request with an abort signal so a hung send cannot outlive the request budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendFeedbackEmail({
      feedbackId: 'cmtimeout1',
      category: 'GENERAL_FEEDBACK',
      description: 'The feedback row is already persisted by the time we get here',
    });

    // The caller awaits this send before returning 201. Without a deadline a
    // Resend stall runs out the function budget and the user is shown a
    // failure for feedback that was in fact saved.
    const [, init] = fetchMock.mock.calls[0];
    const signal = (init as RequestInit).signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it('resolves and logs the failure when the Resend request aborts, leaving emailSent unset', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendFeedbackEmail({
        feedbackId: 'cmtimeout2',
        category: 'GENERAL_FEEDBACK',
        description: 'Aborted send must not fail the submission',
      }),
    ).resolves.toBeUndefined();

    // Swallowed but observable: the send failure has to reach the logs, and
    // the record must not be marked as emailed.
    expect(errorSpy).toHaveBeenCalled();
    expect(vi.mocked(prisma.feedback.update)).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('uses the current text brand in the HTML email header without the old lightning mark', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendFeedbackEmail({
      feedbackId: 'cmbrand123',
      category: 'GENERAL_FEEDBACK',
      description: 'Brand check',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.html).toContain('eVoyage');
    expect(body.html).not.toContain('⚡');
  });
});
