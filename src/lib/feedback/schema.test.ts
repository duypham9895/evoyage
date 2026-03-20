import { describe, it, expect } from 'vitest';
import { feedbackRequestSchema } from './schema';

describe('feedbackRequestSchema', () => {
  const validFeedback = {
    category: 'REPORT_ISSUE' as const,
    description: 'This is a valid description with enough characters',
  };

  describe('valid submissions', () => {
    it('accepts minimal valid feedback (category + description)', () => {
      const result = feedbackRequestSchema.safeParse(validFeedback);
      expect(result.success).toBe(true);
    });

    it('accepts feedback with all optional fields', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: 'user@example.com',
        name: 'Test User',
        phone: '0901234567',
        stationId: 'station-123',
        stationName: 'VinFast Charging Station',
        stepsToReproduce: 'Step 1: Open app\nStep 2: Click button',
        useCase: 'Planning a road trip',
        correctInfo: 'The correct address is...',
        rating: 5,
        pageUrl: 'https://evoyagevn.vercel.app/route',
        userAgent: 'Mozilla/5.0',
        viewport: '1920x1080',
        routeParams: 'start=10.5,106.7',
        honeypot: '',
        formOpenedAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid category values', () => {
      const categories = [
        'REPORT_ISSUE',
        'REQUEST_FEATURE',
        'CONTACT_SUPPORT',
        'STATION_DATA_ERROR',
        'ROUTE_FEEDBACK',
        'GENERAL_FEEDBACK',
      ] as const;

      for (const category of categories) {
        const result = feedbackRequestSchema.safeParse({
          ...validFeedback,
          category,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts empty string for optional string fields', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: '',
        name: '',
        phone: '',
      });
      expect(result.success).toBe(true);
    });

    it('accepts rating values from 1 to 5', () => {
      for (let rating = 1; rating <= 5; rating++) {
        const result = feedbackRequestSchema.safeParse({
          ...validFeedback,
          rating,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('missing required fields', () => {
    it('rejects missing category', () => {
      const result = feedbackRequestSchema.safeParse({
        description: 'A valid description with enough characters',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing description', () => {
      const result = feedbackRequestSchema.safeParse({
        category: 'REPORT_ISSUE',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = feedbackRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('category validation', () => {
    it('rejects invalid category value', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        category: 'INVALID_CATEGORY',
      });
      expect(result.success).toBe(false);
    });

    it('rejects numeric category', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        category: 42,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('description validation', () => {
    it('rejects description shorter than minimum length (10 chars)', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        description: 'short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('10');
      }
    });

    it('accepts description at exactly minimum length', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        description: 'A'.repeat(10),
      });
      expect(result.success).toBe(true);
    });

    it('rejects description exceeding maximum length (2000 chars)', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        description: 'A'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('accepts description at exactly maximum length', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        description: 'A'.repeat(2000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('email validation', () => {
    it('accepts valid email', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: 'user@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Email');
      }
    });

    it('rejects email without domain', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: 'user@',
      });
      expect(result.success).toBe(false);
    });

    it('rejects email exceeding 200 characters', () => {
      const longEmail = 'a'.repeat(190) + '@example.com';
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: longEmail,
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty string as email (optional)', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        email: '',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('rating validation', () => {
    it('rejects rating below 1', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        rating: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects rating above 5', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        rating: 6,
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer rating', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        rating: 3.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative rating', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        rating: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('XSS prevention in text fields', () => {
    it('does not strip HTML tags (schema validates structure, not sanitization)', () => {
      const xssPayload = '<script>alert("xss")</script>This has enough chars';
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        description: xssPayload,
      });
      // Zod schema accepts the string — XSS sanitization happens at render time
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe(xssPayload);
      }
    });

    it('enforces max length which limits XSS payload size', () => {
      const longXss = '<script>' + 'x'.repeat(2000) + '</script>';
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        description: longXss,
      });
      expect(result.success).toBe(false);
    });

    it('enforces max length on optional fields to limit injection', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        name: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('enforces max length on stepsToReproduce', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        stepsToReproduce: 'A'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('field length limits', () => {
    it('rejects name over 100 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        name: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('rejects phone over 20 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        phone: '0'.repeat(21),
      });
      expect(result.success).toBe(false);
    });

    it('rejects stationId over 100 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        stationId: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('rejects stationName over 200 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        stationName: 'A'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('rejects useCase over 1000 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        useCase: 'A'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('rejects correctInfo over 1000 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        correctInfo: 'A'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('rejects pageUrl over 2000 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        pageUrl: 'A'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('rejects userAgent over 500 characters', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        userAgent: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('spam prevention fields', () => {
    it('accepts honeypot field', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        honeypot: '',
      });
      expect(result.success).toBe(true);
    });

    it('accepts formOpenedAt timestamp', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        formOpenedAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-number formOpenedAt', () => {
      const result = feedbackRequestSchema.safeParse({
        ...validFeedback,
        formOpenedAt: 'not-a-number',
      });
      expect(result.success).toBe(false);
    });
  });
});
