/**
 * Feedback system constants — category definitions, labels, and configuration.
 */

export const FEEDBACK_CATEGORIES = [
  'REPORT_ISSUE',
  'REQUEST_FEATURE',
  'CONTACT_SUPPORT',
  'STATION_DATA_ERROR',
  'MISSING_STATION',
  'STATION_AMENITY_MISSING',
  'ROUTE_FEEDBACK',
  'GENERAL_FEEDBACK',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** High-priority categories that get [Urgent] email prefix */
export const URGENT_CATEGORIES: ReadonlySet<FeedbackCategory> = new Set([
  'REPORT_ISSUE',
  'STATION_DATA_ERROR',
  'MISSING_STATION',
]);

/** i18n key mapping for category labels */
export const CATEGORY_LABEL_KEYS: Record<FeedbackCategory, string> = {
  REPORT_ISSUE: 'feedback_cat_report_issue',
  REQUEST_FEATURE: 'feedback_cat_request_feature',
  CONTACT_SUPPORT: 'feedback_cat_contact_support',
  STATION_DATA_ERROR: 'feedback_cat_station_data_error',
  MISSING_STATION: 'feedback_cat_missing_station',
  STATION_AMENITY_MISSING: 'feedback_cat_station_amenity_missing',
  ROUTE_FEEDBACK: 'feedback_cat_route_feedback',
  GENERAL_FEEDBACK: 'feedback_cat_general_feedback',
};

/** Vietnamese labels (used server-side for email) */
export const CATEGORY_LABELS_VI: Record<FeedbackCategory, string> = {
  REPORT_ISSUE: 'Báo cáo lỗi',
  REQUEST_FEATURE: 'Đề xuất tính năng',
  CONTACT_SUPPORT: 'Liên hệ hỗ trợ',
  STATION_DATA_ERROR: 'Lỗi dữ liệu trạm sạc',
  MISSING_STATION: 'Trạm chưa có trong eVoyage',
  STATION_AMENITY_MISSING: 'Thiếu địa điểm gần trạm sạc',
  ROUTE_FEEDBACK: 'Phản hồi tuyến đường',
  GENERAL_FEEDBACK: 'Góp ý chung',
};

/** Daily email budget cap */
export const DAILY_EMAIL_CAP = 80;

/** Minimum description length */
export const MIN_DESCRIPTION_LENGTH = 10;

/** Maximum description length */
export const MAX_DESCRIPTION_LENGTH = 2000;

/** Rate limit: submissions per hour per IP */
export const FEEDBACK_RATE_LIMIT = 5;

/** Rate limit window in ms (1 hour) */
export const FEEDBACK_RATE_WINDOW_MS = 3_600_000;

/** Minimum time between form open and submit (ms) — spam prevention */
export const MIN_SUBMIT_DELAY_MS = 3000;
