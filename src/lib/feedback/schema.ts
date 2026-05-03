/**
 * Zod validation schemas for the feedback API.
 */
import { z } from 'zod';
import { FEEDBACK_CATEGORIES, MIN_DESCRIPTION_LENGTH, MAX_DESCRIPTION_LENGTH } from './constants';

export const feedbackRequestSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  description: z
    .string()
    .min(MIN_DESCRIPTION_LENGTH, `Mô tả phải có ít nhất ${MIN_DESCRIPTION_LENGTH} ký tự`)
    .max(MAX_DESCRIPTION_LENGTH),
  email: z.string().email('Email không hợp lệ').max(200).optional().or(z.literal('')),
  name: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),

  // Category-specific
  stationId: z.string().max(100).optional().or(z.literal('')),
  stationName: z.string().max(200).optional().or(z.literal('')),
  stepsToReproduce: z.string().max(1000).optional().or(z.literal('')),
  useCase: z.string().max(1000).optional().or(z.literal('')),
  correctInfo: z.string().max(1000).optional().or(z.literal('')),
  rating: z.number().int().min(1).max(5).optional(),
  // MISSING_STATION specific — coordinates of the station the user wants to add.
  proposedLatitude: z.number().min(-90).max(90).optional(),
  proposedLongitude: z.number().min(-180).max(180).optional(),
  proposedProvider: z.string().max(100).optional().or(z.literal('')),

  // Context (auto-captured)
  pageUrl: z.string().max(2000).optional().or(z.literal('')),
  userAgent: z.string().max(500).optional().or(z.literal('')),
  viewport: z.string().max(20).optional().or(z.literal('')),
  routeParams: z.string().max(5000).optional().or(z.literal('')),

  // Spam prevention
  honeypot: z.string().optional(),
  formOpenedAt: z.number().optional(), // client-side timestamp
});

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
