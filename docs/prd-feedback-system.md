# PRD: Feedback & Contact System — eVoyage

**Version:** 1.1
**Date:** 2026-03-19
**Author:** Product Team
**Status:** Approved with Revisions

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [User Stories](#2-user-stories)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [UI/UX Design Specifications](#5-uiux-design-specifications)
6. [Technical Requirements](#6-technical-requirements)
7. [Success Metrics](#7-success-metrics)
8. [Priority & Phasing](#8-priority--phasing)

---

## 1. Overview & Goals

### 1.1 Context

eVoyage is a VinFast EV trip planner serving Vietnamese EV owners. The app helps users plan road trips with accurate range calculations, smart charging stops, and real-time station data. Currently, there is no mechanism for users to report issues, request features, or contact support — creating a gap between user needs and product development.

### 1.2 Problem Statement

- Users encountering incorrect station data (offline status, wrong location, missing connectors) have no way to report errors, leading to unreliable data over time.
- Route calculation issues or bugs go unreported, slowing down quality improvements.
- There is no channel for users to suggest features or communicate with the team, limiting product-market fit insights.
- The team lacks structured feedback data to prioritize the roadmap.

### 1.3 Goals

| Goal | Metric |
|------|--------|
| Enable users to report issues and errors easily | < 60 seconds to submit feedback |
| Capture structured feedback for product decisions | 80%+ of submissions include a category |
| Notify the team of critical issues in real time | Email delivered within 30 seconds of submission |
| Build trust with the Vietnamese EV community | Positive sentiment in feedback after 3 months |
| Track and resolve feedback systematically | Dashboard-ready data in the database |

### 1.4 Non-Goals (Out of Scope for V1)

- Real-time chat / live support
- Public feedback board or feature voting (Canny-style)
- User accounts or authentication (eVoyage is currently auth-free)
- Automated ticket management or SLA tracking
- AI-powered auto-responses

### 1.5 Research Summary

Research into leading feedback systems (Intercom, Zendesk, Canny, Pendo, UserVoice, Featurebase) and UX patterns reveals the following best practices applied to this PRD:

- **Bottom sheet / modal pattern** outperforms dedicated pages for in-app feedback, achieving 25-30% higher engagement (NN/g, Material Design 3).
- **Contextual triggers** (e.g., feedback button near station cards, post-trip prompt) increase submission quality over generic contact pages.
- **Category-first UX** (selecting category before filling details) reduces cognitive load and produces more actionable data (Canny, Pendo).
- **Minimal required fields** — name, category, and description are sufficient; optional fields reduce abandonment.
- **Immediate confirmation** with micro-interaction (success animation) builds trust that feedback was received.
- **Resend** is the recommended email provider for Next.js apps — modern API, React Email templates, excellent deliverability, and a generous free tier (100 emails/day).

---

## 2. User Stories

### 2.1 Core User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| US-01 | VinFast driver | report a station data error (wrong status, location, or connector info) | the data gets corrected for all users | P0 |
| US-02 | Trip planner | report an issue with route calculation or charging stop suggestions | the team can fix bugs that affect trip planning | P0 |
| US-03 | EV owner | request a new feature or improvement | the product evolves to meet my needs | P1 |
| US-04 | User in need | contact support for help using the app | I can get assistance when stuck | P1 |
| US-05 | Trip reviewer | provide feedback on a completed route (accuracy, experience) | the routing algorithm improves over time | P2 |
| US-05b | App user | share general impressions, praise, or unstructured feedback | the team hears what users think beyond specific issues | P2 |
| US-06 | Product team | receive email notifications when feedback is submitted | I can respond to critical issues quickly | P0 |
| US-07 | Product team | view all feedback in a structured database | I can analyze trends and prioritize the roadmap | P1 |

### 2.2 Edge Case Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-08 | User with slow connection | have my feedback queued if submission fails | I don't lose my input |
| US-09 | Mobile user | fill out the form easily with one hand | the experience is comfortable on phone |
| US-10 | Vietnamese speaker | see all labels and messages in Vietnamese | I understand every field without hesitation |
| US-11 | Repeat reporter | not have to re-enter my email every time | submitting multiple reports is frictionless |

---

## 3. Functional Requirements

### 3.1 Feedback Categories

Six categories, each with tailored form fields:

#### Category 1: Báo cáo lỗi (Report Issue)

- **Purpose:** Bug reports, crashes, UI glitches, calculation errors
- **Required fields:** Description
- **Optional fields:** Email, screenshot upload, device/browser info (auto-detected), steps to reproduce
- **Auto-captured:** URL/route parameters, viewport size, user agent, timestamp

#### Category 2: Đề xuất tính năng (Request Feature)

- **Purpose:** Feature suggestions, improvements, enhancements
- **Required fields:** Description
- **Optional fields:** Email, use case explanation
- **Auto-captured:** Current page context, timestamp

#### Category 3: Liên hệ hỗ trợ (Contact Support)

- **Purpose:** General help requests, usage questions, account-related inquiries
- **Required fields:** Email (required — support needs a reply channel), Description
- **Optional fields:** Name, phone number
- **Auto-captured:** Timestamp

#### Category 4: Lỗi dữ liệu trạm sạc (Station Data Error)

- **Purpose:** Incorrect station info — wrong status, location, connectors, operating hours
- **Required fields:** Description of the error
- **Optional fields:** Email, station name (auto-filled if triggered from station card), correct information the user knows, photo upload (single image, max 5 MB)
- **Auto-captured:** Station ID (if triggered contextually), current page URL, timestamp

#### Category 5: Phản hồi tuyến đường (Route Feedback)

- **Purpose:** Feedback on route accuracy, charging stop quality, range estimates
- **Required fields:** Description
- **Optional fields:** Email, rating (1-5 stars), route details
- **Auto-captured:** Route parameters from URL (origin, destination, vehicle, battery settings), timestamp

#### Category 6: Góp ý chung (General Feedback)

- **Purpose:** Unstructured feedback that doesn't fit other categories — general impressions, praise, suggestions, or anything else the user wants to share
- **Required fields:** Description
- **Optional fields:** Email
- **Auto-captured:** Current page URL, timestamp

### 3.2 Feedback Submission Flow

1. User clicks the feedback trigger (floating button or menu item).
2. Modal/bottom sheet opens with category selection (icon + label grid).
3. User selects a category — form fields appear for that category.
4. User fills in the form (required fields validated inline).
5. User taps "Gửi phản hồi" (Submit Feedback).
6. Loading state with spinner.
7. Success: confirmation animation + thank-you message. Modal auto-closes after 2 seconds.
8. Failure: error message with retry button. User input is preserved.

### 3.3 Email Notification

- **Recipient:** evoyagevn@icloud.com
- **Trigger:** Every feedback submission
- **Email content:**
  - Subject: `[eVoyage] {Category} — {First 50 chars of description}`
  - Body: All submitted fields + auto-captured metadata formatted in a clean HTML template
  - Reply-to: User's email (if provided), otherwise noreply
- **Priority tagging:** "Report Issue" and "Station Data Error" marked as high-priority in subject line with `[Urgent]` prefix

### 3.4 Data Storage

- All feedback stored in PostgreSQL via Prisma (consistent with existing stack).
- Each submission creates one `Feedback` record with full metadata.
- No data is lost — even if email delivery fails, the database record persists.

### 3.5 Data Retention Policy

- **Open/In-review feedback:** Retained indefinitely until resolved or closed.
- **Resolved/Closed feedback:** Retained for 12 months after resolution date, then eligible for automated archival or deletion.
- **Archived records:** May be exported as CSV before deletion for long-term analytics.

### 3.6 Rate Limiting

- Maximum 5 submissions per IP per hour (using existing Upstash rate limiter).
- Rate limit message displayed in Vietnamese: "Bạn đã gửi quá nhiều phản hồi. Vui lòng thử lại sau."

### 3.7 Spam Prevention

- Honeypot field (hidden input that bots fill, humans skip) — no CAPTCHA to maintain UX quality.
- Minimum 3-second delay between form open and submit (prevents automated submissions).
- Description minimum length: 10 characters.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|--------|--------|
| Modal open time | < 100ms |
| Form submission (API response) | < 2 seconds |
| Email delivery | < 30 seconds |
| Bundle size increase | < 15 KB gzipped |

### 4.2 Accessibility

- All form fields have associated `<label>` elements.
- Focus management: focus trapped inside modal when open, restored on close.
- Keyboard navigable: Tab through fields, Enter to submit, Escape to close.
- Screen reader announcements for success/error states via `aria-live` regions.
- Color contrast ratio >= 4.5:1 for all text (already met by eVoyage's design system).

### 4.3 Responsiveness

- **Desktop (> 768px):** Centered modal, 480px max-width, backdrop blur overlay.
- **Mobile (< 768px):** Bottom sheet sliding up from the bottom, full-width, drag-to-dismiss handle.
- Touch targets minimum 44x44px (Apple HIG).

### 4.4 Localization

- All user-facing text in Vietnamese (primary).
- English fallback not required for V1 (target audience is Vietnamese EV owners).
- Unicode support for Vietnamese diacritics in all fields and database storage.

### 4.5 Security

- Server-side validation of all inputs (Zod schema, consistent with existing codebase).
- XSS prevention: sanitize all user input before storage and email rendering.
- No PII stored beyond what the user voluntarily provides (email, name, phone).
- API key for Resend stored as environment variable, never exposed client-side.
- CSRF protection via Next.js built-in mechanisms (Server Actions or API routes with origin check).

### 4.6 Reliability

- Database write must succeed before returning success to the user.
- Email delivery is fire-and-forget — failure does not block the user's success response.
- Email delivery failures logged server-side for monitoring.

---

## 5. UI/UX Design Specifications

### 5.1 Entry Points (Feedback Triggers)

#### Primary: Floating Action Button (FAB)

- **Position:** Bottom-right corner, 16px from edges.
- **Mobile:** Bottom-right, 16px above the mobile tab bar (to avoid overlap with `MobileTabBar` component).
- **Appearance:** 48px circle, `--color-surface` background with `--color-accent` (#00D4AA) icon.
- **Icon:** Speech bubble with "?" or pencil icon (consistent with feedback semantics).
- **Hover state:** Scale to 1.05x, background transitions to `--color-surface-hover`.
- **Label tooltip (desktop):** "Phản hồi" on hover.
- **Z-index:** Above map but below modals (z-40).

#### Secondary: Header Menu Item

- **Location:** Inside the Header component, as a menu/dropdown item labeled "Phản hồi & Liên hệ".
- **Purpose:** Discoverable alternative for users who don't notice the FAB.

#### Contextual: Station Card Trigger

- **Location:** On each station detail card / `StationDetailExpander` component.
- **Appearance:** Small "Báo lỗi" (Report error) text link or icon button.
- **Behavior:** Opens feedback modal pre-selected to "Station Data Error" category with station ID and name auto-filled.

### 5.2 Modal / Bottom Sheet Design

#### Desktop: Centered Modal

```
+--------------------------------------------------+
|  [X]                   Phản hồi                   |
+--------------------------------------------------+
|                                                    |
|  Chọn loại phản hồi:                              |
|                                                    |
|  +----------+  +----------+  +----------+         |
|  |  [icon]  |  |  [icon]  |  |  [icon]  |         |
|  | Báo cáo  |  | Đề xuất  |  | Liên hệ  |         |
|  |   lỗi    |  |tính năng |  | hỗ trợ   |         |
|  +----------+  +----------+  +----------+         |
|                                                    |
|  +----------+  +----------+  +----------+         |
|  |  [icon]  |  |  [icon]  |  |  [icon]  |         |
|  |Lỗi trạm |  |Phản hồi  |  | Góp ý    |         |
|  |   sạc    |  |tuyến đg  |  |  chung   |         |
|  +----------+  +----------+  +----------+         |
|                                                    |
+--------------------------------------------------+
```

- **Max width:** 480px
- **Backdrop:** Semi-transparent black (`rgba(0,0,0,0.6)`) with `backdrop-blur-sm`.
- **Border radius:** 16px
- **Background:** `--color-surface` (#1C1C1E)
- **Header:** Category title + close button (X icon, top-right)
- **Animation:** Fade in + scale from 0.95 to 1.0 (150ms ease-out)

#### Mobile: Bottom Sheet

- **Full width** with 16px top border-radius.
- **Drag handle:** 40px x 4px rounded bar centered at top, `--color-muted` color.
- **Max height:** 85vh (scrollable content inside).
- **Animation:** Slide up from bottom (200ms ease-out), consistent with existing `MobileBottomSheet` component.
- **Dismiss:** Drag down past 30% threshold, tap backdrop, or tap X button.

### 5.3 Category Selection Screen

- **Layout:** 2x3 grid on mobile, 3x2 grid on desktop.
- **Each card:**
  - 80px x 80px on mobile, 100px x 100px on desktop.
  - Icon (24px SVG) + label (2 lines max, 13px font).
  - Background: `--color-background` (#0A0A0B).
  - Border: 1px `--color-surface-hover`.
  - Selected state: Border changes to `--color-accent`, subtle glow.
  - Hover (desktop): Background lightens to `--color-surface-hover`.

- **Category icons and labels:**

| Category | Vietnamese Label | Icon |
|----------|-----------------|------|
| Report Issue | Báo cáo lỗi | Bug/Warning triangle |
| Request Feature | Đề xuất tính năng | Lightbulb |
| Contact Support | Liên hệ hỗ trợ | Headset/Chat |
| Station Data Error | Lỗi dữ liệu trạm sạc | Map pin with X |
| Route Feedback | Phản hồi tuyến đường | Route/Path icon |
| General Feedback | Góp ý chung | Heart/Smile icon |

### 5.4 Form Screen (After Category Selection)

#### Layout

```
+--------------------------------------------------+
|  [<-]  Báo cáo lỗi                          [X]   |
+--------------------------------------------------+
|                                                    |
|  Mô tả vấn đề *                                   |
|  +----------------------------------------------+ |
|  |                                                | |
|  |  (textarea, 4 rows, auto-expand)              | |
|  |                                                | |
|  +----------------------------------------------+ |
|  Tối thiểu 10 ký tự                               |
|                                                    |
|  Email (không bắt buộc)                            |
|  +----------------------------------------------+ |
|  |  example@email.com                             | |
|  +----------------------------------------------+ |
|  Để chúng tôi có thể phản hồi bạn                 |
|                                                    |
|  [Category-specific optional fields here]          |
|                                                    |
|  +----------------------------------------------+ |
|  |         Gửi phản hồi                          | |
|  +----------------------------------------------+ |
|                                                    |
+--------------------------------------------------+
```

#### Field Styling (Consistent with eVoyage Design System)

- **Input fields:**
  - Background: `--color-background` (#0A0A0B)
  - Border: 1px `--color-surface-hover` (#2C2C2E)
  - Focus border: `--color-accent` (#00D4AA)
  - Text color: `--color-foreground` (#F5F5F7)
  - Placeholder color: `--color-muted` (#8E8E93)
  - Padding: 12px 16px
  - Border radius: 8px
  - Font: `--font-sans` (Be Vietnam Pro)

- **Labels:**
  - Font size: 14px, weight: 500
  - Color: `--color-foreground`
  - Required indicator: red asterisk

- **Helper text:**
  - Font size: 12px
  - Color: `--color-muted`

- **Error state:**
  - Border color: `--color-danger` (#FF3B30)
  - Error message: 12px, `--color-danger`

- **Submit button:**
  - Full width
  - Background: `--color-accent` (#00D4AA)
  - Text: #0A0A0B (dark on accent), 16px, weight: 600
  - Border radius: 10px
  - Height: 48px
  - Disabled state: opacity 0.5, cursor not-allowed
  - Loading state: spinner replacing text

- **Back button:** Left arrow icon, returns to category selection (no data loss).

### 5.5 Category-Specific Form Fields

#### Report Issue

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Mô tả vấn đề | Textarea (4 rows) | Yes | Mô tả chi tiết lỗi bạn gặp... |
| Email | Email input | No | email@example.com |
| Các bước tái tạo lỗi | Textarea (2 rows) | No | Bước 1: ... Bước 2: ... |

#### Request Feature

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Mô tả tính năng | Textarea (4 rows) | Yes | Mô tả tính năng bạn muốn có... |
| Email | Email input | No | email@example.com |
| Trường hợp sử dụng | Textarea (2 rows) | No | Bạn sẽ sử dụng tính năng này như thế nào? |

#### Contact Support

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Nội dung | Textarea (4 rows) | Yes | Bạn cần hỗ trợ gì? |
| Email | Email input | Yes | email@example.com |
| Tên | Text input | No | Nguyễn Văn A |
| Số điện thoại | Tel input | No | 0912 345 678 |

#### Station Data Error

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Trạm sạc | Text input (auto-filled if contextual) | No | Tên hoặc địa chỉ trạm sạc |
| Mô tả lỗi | Textarea (4 rows) | Yes | Thông tin nào của trạm sạc bị sai? |
| Thông tin đúng | Textarea (2 rows) | No | Thông tin chính xác là... |
| Ảnh minh họa | Image upload (single, max 5 MB, jpg/png) | No | Chọn ảnh... |
| Email | Email input | No | email@example.com |

#### Route Feedback

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Mô tả | Textarea (4 rows) | Yes | Chia sẻ trải nghiệm tuyến đường của bạn... |
| Đánh giá | Star rating (1-5) | No | Tap to rate |
| Email | Email input | No | email@example.com |

#### General Feedback

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Mô tả | Textarea (4 rows) | Yes | Chia sẻ ý kiến, nhận xét, hoặc bất kỳ điều gì bạn muốn nói... |
| Email | Email input | No | email@example.com |

### 5.6 Success State

- **Animation:** Checkmark icon scales in with a green pulse effect (300ms).
- **Message:** "Cảm ơn bạn! Phản hồi của bạn đã được gửi thành công."
- **Sub-message:** "Chúng tôi sẽ xem xét và phản hồi sớm nhất có thể." (if email was provided)
- **Auto-close:** Modal/bottom sheet closes after 2.5 seconds.
- **No action needed:** No button required, but tapping anywhere dismisses.

### 5.7 Error State

- **Message:** "Không thể gửi phản hồi. Vui lòng thử lại."
- **Retry button:** "Thử lại" — re-submits with the same data.
- **User input is preserved** (form state is not cleared on error).

### 5.8 Star Rating Component (Route Feedback)

- 5 stars in a row, 32px each, spaced 8px apart.
- Empty state: outline stars in `--color-muted`.
- Filled state: solid stars in `--color-warn` (#FF9500, amber).
- Tap/click to select, tap same star to deselect.
- Accessible: keyboard navigable with arrow keys, `aria-label="Đánh giá {n} sao"`.

---

## 6. Technical Requirements

### 6.1 Tech Stack Alignment

The feedback system uses the existing eVoyage tech stack:

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Next.js 16, Tailwind CSS 4 |
| Validation | Zod 4 |
| Backend | Next.js API Routes (App Router) |
| Database | PostgreSQL via Prisma |
| Email | Resend (with React Email templates) |
| Rate Limiting | Upstash Redis (existing) |
| Image Storage | Vercel Blob (for station error photo uploads) |

### 6.2 Database Schema

Add to `prisma/schema.prisma`:

```prisma
model Feedback {
  id        String   @id @default(cuid())

  // Category
  category  String   // REPORT_ISSUE | REQUEST_FEATURE | CONTACT_SUPPORT | STATION_DATA_ERROR | ROUTE_FEEDBACK | GENERAL_FEEDBACK

  // Core fields
  description String
  email       String?
  name        String?
  phone       String?

  // Category-specific fields (stored as JSON)
  stationId   String?  // For STATION_DATA_ERROR — links to ChargingStation.id
  stationName String?  // For STATION_DATA_ERROR — human-readable
  stepsToReproduce String?  // For REPORT_ISSUE
  useCase     String?  // For REQUEST_FEATURE
  correctInfo String?  // For STATION_DATA_ERROR
  rating      Int?     // For ROUTE_FEEDBACK (1-5)
  imageUrl    String?  // For STATION_DATA_ERROR — uploaded photo URL (Vercel Blob)

  // Auto-captured context
  pageUrl     String?
  userAgent   String?
  viewport    String?  // e.g. "390x844"
  routeParams String?  // JSON blob of URL params (origin, dest, vehicle, etc.)

  // Status tracking
  status      String   @default("NEW")  // NEW | IN_REVIEW | RESOLVED | CLOSED
  notes       String?  // Internal team notes
  resolvedAt  DateTime?  // Timestamp when status changed to RESOLVED/CLOSED

  // Metadata
  ipHash      String?  // Hashed IP for rate limiting reference, not raw IP (privacy)
  emailSent   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([category])
  @@index([status])
  @@index([createdAt])
  @@index([stationId])
  @@index([resolvedAt])
}
```

### 6.3 API Design

#### POST `/api/feedback`

**Request body (validated with Zod):**

```typescript
{
  category: "REPORT_ISSUE" | "REQUEST_FEATURE" | "CONTACT_SUPPORT" | "STATION_DATA_ERROR" | "ROUTE_FEEDBACK" | "GENERAL_FEEDBACK",
  description: string,          // min 10 chars, max 2000 chars
  email?: string,               // valid email format
  name?: string,                // max 100 chars
  phone?: string,               // Vietnamese phone format
  stationId?: string,           // valid cuid
  stationName?: string,         // max 200 chars
  stepsToReproduce?: string,    // max 1000 chars
  useCase?: string,             // max 1000 chars
  correctInfo?: string,         // max 1000 chars
  rating?: number,              // 1-5 integer
  imageUrl?: string,            // Vercel Blob URL (uploaded client-side before submit)
  pageUrl?: string,
  userAgent?: string,
  viewport?: string,
  routeParams?: string,         // JSON string
  honeypot?: string             // must be empty (spam check)
}
```

**Response:**

```typescript
// Success (201)
{ success: true, id: string }

// Validation error (400)
{ success: false, error: string, details?: ZodIssue[] }

// Rate limited (429)
{ success: false, error: "Too many submissions. Please try again later." }

// Server error (500)
{ success: false, error: "Internal server error" }
```

**Server-side logic:**

1. Validate request body with Zod schema.
2. Check honeypot field — reject if filled.
3. Check rate limit (5/hour per IP via Upstash).
4. Hash the IP address (SHA-256, no salt needed — just for grouping, not auth).
5. Create `Feedback` record in database.
6. Fire-and-forget: send email notification via Resend (do not await).
7. Return success with feedback ID.

#### POST `/api/feedback/upload` (Phase 2)

- Accepts a single image file (max 5 MB, jpg/png).
- Uploads to Vercel Blob, returns the public URL.
- Rate limited: 5 uploads per IP per hour.
- Used by Station Data Error form before submitting feedback.

#### GET `/api/feedback` (Internal / Admin — Phase 3)

- Protected by API key or basic auth.
- Query params: `category`, `status`, `from`, `to`, `page`, `limit`.
- Returns paginated feedback list.

### 6.4 Email Template

Use React Email (compatible with Resend) to create a clean notification template:

**Subject line format:**
- High priority: `[eVoyage] [Khẩn cấp] Báo cáo lỗi — {first 50 chars}`
- Normal: `[eVoyage] Đề xuất tính năng — {first 50 chars}`

**Email body structure:**

```
+--------------------------------------------------+
|  eVoyage Logo                                      |
+--------------------------------------------------+
|                                                    |
|  Phản hồi mới: {Category Label}                   |
|  Thời gian: {timestamp}                            |
|                                                    |
|  ---                                               |
|                                                    |
|  Mô tả:                                            |
|  {description}                                     |
|                                                    |
|  Email người gửi: {email or "Không cung cấp"}      |
|  {Additional fields based on category}             |
|                                                    |
|  ---                                               |
|                                                    |
|  Ngữ cảnh:                                         |
|  Trang: {pageUrl}                                  |
|  Thiết bị: {userAgent}                             |
|  Màn hình: {viewport}                              |
|  Tham số tuyến: {routeParams}                      |
|                                                    |
+--------------------------------------------------+
|  Email này được gửi từ hệ thống phản hồi eVoyage  |
+--------------------------------------------------+
```

### 6.5 Email Configuration

| Setting | Value |
|---------|-------|
| Provider | Resend |
| From address | `feedback@evoyage.vn` (or Resend default domain initially) |
| To address | `evoyagevn@icloud.com` |
| Reply-to | User's email (if provided) |
| Environment variable | `RESEND_API_KEY` |

**Resend free tier:** 100 emails/day, 3,000 emails/month — sufficient for initial launch. Upgrade if volume exceeds threshold.

### 6.6 File Structure

```
src/
  app/
    api/
      feedback/
        route.ts              # POST handler + validation
        upload/
          route.ts            # Image upload handler (Phase 2)
  components/
    FeedbackButton.tsx         # FAB trigger component
    FeedbackModal.tsx          # Modal/bottom sheet container
    FeedbackCategoryGrid.tsx   # Category selection UI
    FeedbackForm.tsx           # Dynamic form per category
    StarRating.tsx             # Reusable star rating input
    ImageUpload.tsx            # Image upload component (Phase 2)
  lib/
    feedback/
      schema.ts               # Zod validation schemas
      email.ts                 # Email template + send function
      constants.ts             # Category definitions, labels
  emails/
    FeedbackNotification.tsx   # React Email template
```

---

## 7. Success Metrics

### 7.1 Adoption Metrics

| Metric | Target (3 months post-launch) | Measurement |
|--------|-------------------------------|-------------|
| Feedback submission rate | >= 0.5% of weekly active users | Database count / WAU from analytics |
| Category distribution | No single category > 50% of total | Database query |
| Completion rate (open modal -> submit) | >= 40% | Client-side analytics |
| Bounce rate (open modal -> close without action) | < 50% | Client-side analytics |

### 7.2 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Average description length | > 30 characters | Database query |
| Email provided rate | >= 30% of submissions | Database query |
| Spam rate (honeypot catches) | < 5% of total attempts | Server logs |
| Duplicate/nonsense submissions | < 10% | Manual review |

### 7.3 Operational Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email delivery success rate | >= 99% | Resend dashboard |
| API response time (p95) | < 1 second | Vercel analytics |
| Time to first team response | < 24 hours for urgent | Manual tracking |
| Station data errors resolved | >= 80% within 1 week | Status field tracking |

### 7.4 Business Impact

| Metric | Target | Measurement |
|--------|--------|-------------|
| Station data accuracy improvement | Measurable after 3 months | Compare error reports to corrections |
| Feature requests informing roadmap | >= 2 features per quarter | Roadmap tracking |
| User trust signal | Repeat submitters > 10% | Database query |

---

## 8. Priority & Phasing

### Phase 1: MVP (Week 1-2) — P0

**Goal:** Users can submit feedback and the team gets email notifications.

| Task | Effort |
|------|--------|
| Prisma schema: `Feedback` model | 0.5 day |
| Zod validation schemas | 0.5 day |
| API route: `POST /api/feedback` with rate limiting | 1 day |
| Resend integration + email template | 1 day |
| `FeedbackButton` (FAB) component | 0.5 day |
| `FeedbackModal` with category grid | 1 day |
| `FeedbackForm` with all 6 category variants | 1.5 days |
| Success/error states + animations | 0.5 day |
| Mobile bottom sheet adaptation | 0.5 day |
| Spam prevention (honeypot, min time, validation) | 0.5 day |
| Vietnamese copy for all strings | 0.5 day |
| **Total** | **~8 days** |

**Definition of Done:**
- User can open feedback modal from FAB on desktop and mobile.
- All 6 categories render correct form fields.
- Submission creates a database record and sends an email to evoyagevn@icloud.com.
- Rate limiting prevents abuse (5/hour/IP).
- All text is in Vietnamese.

### Phase 2: Contextual Triggers & Enrichment (Week 3-4) — P1

| Task | Effort |
|------|--------|
| Station card "Báo lỗi" trigger with auto-fill | 1 day |
| Header menu feedback link | 0.5 day |
| Star rating component for Route Feedback | 0.5 day |
| Auto-capture route params from URL | 0.5 day |
| Post-trip feedback prompt (triggered after route completes) | 1 day |
| Basic image upload for Station Data Error (Vercel Blob) | 1.5 days |
| **Total** | **~5 days** |

### Phase 3: Admin & Tracking (Week 5-6) — P2

| Task | Effort |
|------|--------|
| GET `/api/feedback` with filtering/pagination | 1 day |
| Admin view page (protected route) with table layout | 2 days |
| — Sortable columns: date, category, status, email | (included) |
| — Inline expandable row to view full description + metadata | (included) |
| — Category and status filter dropdowns | (included) |
| — Date range picker for filtering | (included) |
| Status update functionality (NEW -> IN_REVIEW -> RESOLVED -> CLOSED) | 1 day |
| Internal notes field (editable per feedback record) | 0.5 day |
| Basic analytics dashboard (category breakdown, submission trends over time, resolution rate) | 1.5 days |
| Data retention: automated archival job for resolved records older than 12 months | 1 day |
| **Total** | **~7 days** |

### Phase 4: Enhancements (Future) — P3

- Offline queue (IndexedDB) for failed submissions
- Public status page for reported station errors
- Email confirmation to the user after submission
- Feedback digest email (weekly summary to the team)
- Multi-image upload support (up to 3 images per submission)

---

## Appendix A: Vietnamese Copy Reference

| Key | Vietnamese Text |
|-----|----------------|
| modal_title | Phản hồi |
| category_prompt | Chọn loại phản hồi |
| cat_report_issue | Báo cáo lỗi |
| cat_request_feature | Đề xuất tính năng |
| cat_contact_support | Liên hệ hỗ trợ |
| cat_station_error | Lỗi dữ liệu trạm sạc |
| cat_route_feedback | Phản hồi tuyến đường |
| cat_general_feedback | Góp ý chung |
| field_description | Mô tả |
| field_email | Email |
| field_name | Tên |
| field_phone | Số điện thoại |
| field_steps | Các bước tái tạo lỗi |
| field_use_case | Trường hợp sử dụng |
| field_station | Trạm sạc |
| field_correct_info | Thông tin đúng |
| field_rating | Đánh giá |
| field_image | Ảnh minh họa |
| placeholder_description | Mô tả chi tiết... |
| placeholder_email | email@example.com |
| placeholder_general | Chia sẻ ý kiến, nhận xét, hoặc bất kỳ điều gì bạn muốn nói... |
| required_indicator | * Bắt buộc |
| min_chars | Tối thiểu {n} ký tự |
| submit_button | Gửi phản hồi |
| submitting | Đang gửi... |
| success_title | Cảm ơn bạn! |
| success_message | Phản hồi của bạn đã được gửi thành công. |
| success_reply | Chúng tôi sẽ xem xét và phản hồi sớm nhất có thể. |
| error_message | Không thể gửi phản hồi. Vui lòng thử lại. |
| retry_button | Thử lại |
| rate_limit | Bạn đã gửi quá nhiều phản hồi. Vui lòng thử lại sau. |
| station_report_link | Báo lỗi |
| back_button | Quay lại |

## Appendix B: Research Sources

- [Pendo — Top 10 User Feedback Tools](https://www.pendo.io/pendo-blog/the-top-10-user-feedback-tools-in-2025/)
- [Featurebase — Top 20 Product Feedback Software](https://www.featurebase.app/blog/product-feedback-software)
- [Canny — Customer Feedback Strategy Best Practices](https://canny.io/blog/customer-feedback-strategy/)
- [NN/g — Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [Material Design 3 — Bottom Sheets](https://m3.material.io/components/bottom-sheets/guidelines)
- [UX Collective — Sheet, Dialog, or Snackbar](https://uxdesign.cc/sheet-dialog-or-snackbar-what-should-a-designer-go-for-65af3a0b4aeb)
- [IxDF — How to Design UI Forms in 2026](https://ixdf.org/literature/article/ui-form-design)
- [UX Planet — Guide to Feedback Form Design in Web Apps](https://uxplanet.org/guide-to-the-best-feedback-form-design-in-web-apps-with-examples-b78655c9af95)
- [Resend — Send Emails with Next.js](https://resend.com/docs/send-with-nextjs)
- [SendGrid — Email Notification Best Practices](https://sendgrid.com/blog/product-email-notifications/)
- [SendGrid — Transactional Email Best Practices](https://sendgrid.com/en-us/resource/Ultimate-guide-Effective-Transactional-Emails)
- [Intercom vs Zendesk Comparison](https://www.socialintents.com/blog/intercom-vs-zendesk/)
