/**
 * Email notification for feedback submissions.
 * Uses Resend if available, otherwise logs and marks emailSent=false.
 */
import { prisma } from '@/lib/prisma';
import {
  CATEGORY_LABELS_VI,
  URGENT_CATEGORIES,
  DAILY_EMAIL_CAP,
  type FeedbackCategory,
} from './constants';

interface EmailPayload {
  readonly feedbackId: string;
  readonly category: FeedbackCategory;
  readonly description: string;
  readonly email?: string;
  readonly name?: string;
  readonly phone?: string;
  readonly stationId?: string;
  readonly stationName?: string;
  readonly stepsToReproduce?: string;
  readonly useCase?: string;
  readonly correctInfo?: string;
  readonly rating?: number;
  readonly pageUrl?: string;
  readonly userAgent?: string;
  readonly viewport?: string;
}

function buildSubject(category: FeedbackCategory, description: string): string {
  const label = CATEGORY_LABELS_VI[category];
  const preview = description.slice(0, 50).replace(/\n/g, ' ');
  const prefix = URGENT_CATEGORIES.has(category) ? '[Khẩn cấp] ' : '';
  return `[eVoyage] ${prefix}${label} — ${preview}`;
}

function buildHtmlBody(payload: EmailPayload): string {
  const label = CATEGORY_LABELS_VI[payload.category];
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const rows: string[] = [];
  rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78;width:140px">Loại phản hồi</td><td style="padding:8px 12px;color:#E8E8ED">${label}</td></tr>`);
  rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Thời gian</td><td style="padding:8px 12px;color:#E8E8ED">${time}</td></tr>`);
  rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">ID</td><td style="padding:8px 12px;color:#E8E8ED;font-family:monospace;font-size:12px">${payload.feedbackId}</td></tr>`);

  rows.push(`<tr><td colspan="2" style="padding:12px;border-top:1px solid #252530"></td></tr>`);
  rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78;vertical-align:top">Mô tả</td><td style="padding:8px 12px;color:#E8E8ED;white-space:pre-wrap">${escapeHtml(payload.description)}</td></tr>`);

  if (payload.email) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Email</td><td style="padding:8px 12px;color:#00D4AA">${escapeHtml(payload.email)}</td></tr>`);
  }
  if (payload.name) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Tên</td><td style="padding:8px 12px;color:#E8E8ED">${escapeHtml(payload.name)}</td></tr>`);
  }
  if (payload.phone) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">SĐT</td><td style="padding:8px 12px;color:#E8E8ED">${escapeHtml(payload.phone)}</td></tr>`);
  }
  if (payload.stationName) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Trạm sạc</td><td style="padding:8px 12px;color:#E8E8ED">${escapeHtml(payload.stationName)}</td></tr>`);
  }
  if (payload.stepsToReproduce) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78;vertical-align:top">Tái tạo lỗi</td><td style="padding:8px 12px;color:#E8E8ED;white-space:pre-wrap">${escapeHtml(payload.stepsToReproduce)}</td></tr>`);
  }
  if (payload.useCase) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78;vertical-align:top">Use case</td><td style="padding:8px 12px;color:#E8E8ED;white-space:pre-wrap">${escapeHtml(payload.useCase)}</td></tr>`);
  }
  if (payload.correctInfo) {
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78;vertical-align:top">Thông tin đúng</td><td style="padding:8px 12px;color:#E8E8ED;white-space:pre-wrap">${escapeHtml(payload.correctInfo)}</td></tr>`);
  }
  if (payload.rating) {
    const stars = '★'.repeat(payload.rating) + '☆'.repeat(5 - payload.rating);
    rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Đánh giá</td><td style="padding:8px 12px;color:#FFAB40;font-size:18px">${stars}</td></tr>`);
  }

  // Context section
  if (payload.pageUrl || payload.userAgent || payload.viewport) {
    rows.push(`<tr><td colspan="2" style="padding:12px;border-top:1px solid #252530"></td></tr>`);
    if (payload.pageUrl) {
      rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Trang</td><td style="padding:8px 12px;color:#E8E8ED;font-size:12px">${escapeHtml(payload.pageUrl)}</td></tr>`);
    }
    if (payload.userAgent) {
      rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Thiết bị</td><td style="padding:8px 12px;color:#E8E8ED;font-size:11px">${escapeHtml(payload.userAgent.slice(0, 200))}</td></tr>`);
    }
    if (payload.viewport) {
      rows.push(`<tr><td style="padding:8px 12px;color:#6B6B78">Màn hình</td><td style="padding:8px 12px;color:#E8E8ED">${escapeHtml(payload.viewport)}</td></tr>`);
    }
  }

  return `
    <div style="max-width:600px;margin:0 auto;background:#1A1A1F;border-radius:12px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif">
      <div style="padding:16px 20px;background:#0F0F11;border-bottom:1px solid #252530">
        <span style="color:#00D4AA;font-weight:700;font-size:18px">⚡ eVoyage</span>
        <span style="color:#6B6B78;font-size:14px;margin-left:12px">Phản hồi mới</span>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows.join('')}</table>
      <div style="padding:12px 20px;background:#0F0F11;border-top:1px solid #252530;color:#6B6B78;font-size:11px;text-align:center">
        Email này được gửi từ hệ thống phản hồi eVoyage
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Check if we've exceeded the daily email cap.
 * Returns true if under cap.
 */
async function isUnderDailyEmailCap(): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await prisma.feedback.count({
    where: {
      emailSent: true,
      createdAt: { gte: startOfDay },
    },
  });

  return count < DAILY_EMAIL_CAP;
}

/**
 * Send feedback notification email. Fire-and-forget.
 * Marks emailSent on the record if successful.
 */
export async function sendFeedbackEmail(payload: EmailPayload): Promise<void> {
  try {
    // Check daily cap
    const underCap = await isUnderDailyEmailCap();
    if (!underCap) {
      console.warn(`[feedback] Daily email cap (${DAILY_EMAIL_CAP}) reached, skipping email for ${payload.feedbackId}`);
      return;
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const recipients = process.env.FEEDBACK_EMAIL_TO;

    if (!resendApiKey || !recipients) {
      console.warn('[feedback] RESEND_API_KEY or FEEDBACK_EMAIL_TO not configured, skipping email');
      return;
    }

    const toAddresses = recipients.split(',').map((e) => e.trim()).filter(Boolean);
    if (toAddresses.length === 0) return;

    const subject = buildSubject(payload.category, payload.description);
    const html = buildHtmlBody(payload);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.FEEDBACK_EMAIL_FROM ?? 'eVoyage Feedback <onboarding@resend.dev>',
        to: toAddresses,
        reply_to: payload.email || undefined,
        subject,
        html,
      }),
    });

    if (response.ok) {
      await prisma.feedback.update({
        where: { id: payload.feedbackId },
        data: { emailSent: true },
      });
    } else {
      const errorBody = await response.text();
      console.error(`[feedback] Resend API error (${response.status}):`, errorBody);
    }
  } catch (err) {
    console.error('[feedback] Email send failed:', err);
  }
}
