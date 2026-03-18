# Station Detail Card Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken "Không có thông tin chi tiết" station detail with a two-tier chip strip that always shows useful data from the VinFast list API, with on-demand OCPI detail expansion.

**Architecture:** The Prisma schema already has `chargingStatus`, `parkingFee`, `accessType` fields but the cron job doesn't populate them. We fix the data layer first (cron + types), then build the UI layer (StationInfoChips + StationDetailExpander), then clean up the old component.

**Tech Stack:** Next.js 14, React, Prisma, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-station-detail-redesign-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/types/index.ts` | Add `chargingStatus`, `parkingFee` to `ChargingStationData` | Modify |
| `src/app/api/cron/refresh-vinfast/route.ts` | Populate new fields from VinFast list API, 24/7 detection | Modify |
| `src/app/api/stations/[id]/vinfast-detail/route.ts` | Increase cache TTL to 24h | Modify |
| `src/locales/vi.json` | Add `station_*` keys, remove `vinfast_*` keys | Modify |
| `src/locales/en.json` | Add `station_*` keys, remove `vinfast_*` keys | Modify |
| `src/components/StationInfoChips.tsx` | Tier 1 — horizontal chip strip, all providers | Create |
| `src/components/StationDetailExpander.tsx` | Tier 2 — expandable OCPI detail, VinFast only | Create |
| `src/components/TripSummary.tsx` | Replace inline station info + VinFastDetailPanel | Modify |
| `src/components/VinFastDetailPanel.tsx` | Delete | Delete |
| `src/components/__tests__/StationInfoChips.test.tsx` | Unit tests for chip rendering logic | Create |

---

### Task 1: Update TypeScript Types

**Files:**
- Modify: `src/types/index.ts:75-90`

- [ ] **Step 1: Add new fields to `ChargingStationData` interface**

In `src/types/index.ts`, add two new optional fields to `ChargingStationData`:

```typescript
export interface ChargingStationData {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly province: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly chargerTypes: readonly string[];
  readonly connectorTypes: readonly string[];
  readonly portCount: number;
  readonly maxPowerKw: number;
  readonly stationType: 'public' | 'private';
  readonly isVinFastOnly: boolean;
  readonly operatingHours: string | null;
  readonly provider: string;
  readonly chargingStatus: string | null;
  readonly parkingFee: boolean | null;
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: PASS — new fields are optional (`| null`), so existing code constructing `ChargingStationData` won't break as long as the stations API includes them.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add chargingStatus and parkingFee to ChargingStationData type"
```

---

### Task 2: Update Cron Job to Populate New Fields

**Files:**
- Modify: `src/app/api/cron/refresh-vinfast/route.ts:86-110`

- [ ] **Step 1: Update stationData construction to use list API values**

Replace the `stationData` object (lines 95-110) to use actual VinFast data instead of hardcoded values. Key changes:

```typescript
// 24/7 detection logic
const operatingHours =
  s.open_time_service === '00:00' && s.close_time_service === '23:59'
    ? '24/7'
    : s.open_time_service && s.close_time_service
      ? `${s.open_time_service} - ${s.close_time_service}`
      : null;

const stationData = {
  name: s.name,
  address: s.address,
  province: s.province_id,
  latitude: lat,
  longitude: lng,
  chargerTypes: JSON.stringify(['DC_150kW', 'AC_11kW']),
  connectorTypes: JSON.stringify(['CCS2', 'Type2_AC']),
  portCount: 4,
  maxPowerKw: 150,
  stationType: s.access_type === 'Restricted' ? 'restricted' : 'public',
  isVinFastOnly: true,
  provider: 'VinFast',
  operatingHours,
  chargingStatus: s.charging_status ?? null,
  parkingFee: s.parking_fee ?? null,
  scrapedAt: new Date(),
};
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/refresh-vinfast/route.ts
git commit -m "feat: populate chargingStatus, parkingFee, and operatingHours from VinFast list API"
```

---

### Task 3: Increase Detail Cache TTL

**Files:**
- Modify: `src/app/api/stations/[id]/vinfast-detail/route.ts:17`

- [ ] **Step 1: Change CACHE_TTL_MS from 6h to 24h**

```typescript
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stations/[id]/vinfast-detail/route.ts
git commit -m "perf: increase VinFast detail cache TTL from 6h to 24h"
```

---

### Task 4: Update Locale Strings

**Files:**
- Modify: `src/locales/vi.json:93-105`
- Modify: `src/locales/en.json:93-105`

- [ ] **Step 1: Add station_* keys and keep vinfast_* keys temporarily in vi.json**

Replace lines 93-105 in `src/locales/vi.json` with:

```json
  "station_status_active": "Sẵn sàng",
  "station_status_busy": "Đang bận",
  "station_status_unavailable": "Không khả dụng",
  "station_status_inactive": "Ngừng hoạt động",
  "station_hours_24h": "24/7",
  "station_parking_free": "Đỗ xe miễn phí",
  "station_parking_paid": "Có phí đỗ xe",
  "station_ports": "{{count}} cổng",
  "station_detail_expand": "Chi tiết ▾",
  "station_detail_collapse": "Thu gọn ▴",
  "station_detail_loading": "Đang tải...",
  "station_detail_temp_unavailable": "Tạm thời không khả dụng",
  "station_connector": "{{type}} · {{power}}kW",
  "station_hardware": "Thiết bị: {{vendor}} {{model}}",
  "station_section_connectors": "Chi tiết các cổng sạc",
  "station_section_images": "Hình ảnh trạm",
  "station_last_updated": "Cập nhật: {{time}}",

  "vinfast_detail": "Xem chi tiết",
  "vinfast_detail_loading": "Đang tải thông tin trạm...",
  "vinfast_status": "Trạng thái",
  "vinfast_status_available": "Sẵn sàng",
  "vinfast_status_busy": "Đang bận",
  "vinfast_status_unavailable": "Không khả dụng",
  "vinfast_ports": "{{count}} cổng sạc",
  "vinfast_24h": "24/7",
  "vinfast_parking_fee": "Có phí gửi xe",
  "vinfast_no_parking_fee": "Gửi xe miễn phí",
  "vinfast_connector": "{{type}} · {{power}}kW",
  "vinfast_hardware": "Thiết bị: {{vendor}} {{model}}",
  "vinfast_detail_unavailable": "Không có thông tin chi tiết"
```

Note: Keep `vinfast_*` keys until Task 7 deletes VinFastDetailPanel. They will be removed together.

- [ ] **Step 2: Apply same changes to en.json**

Replace lines 93-105 in `src/locales/en.json` with equivalent English translations:

```json
  "station_status_active": "Available",
  "station_status_busy": "Busy",
  "station_status_unavailable": "Unavailable",
  "station_status_inactive": "Inactive",
  "station_hours_24h": "24/7",
  "station_parking_free": "Free parking",
  "station_parking_paid": "Parking fee",
  "station_ports": "{{count}} ports",
  "station_detail_expand": "Details ▾",
  "station_detail_collapse": "Collapse ▴",
  "station_detail_loading": "Loading...",
  "station_detail_temp_unavailable": "Temporarily unavailable",
  "station_connector": "{{type}} · {{power}}kW",
  "station_hardware": "Hardware: {{vendor}} {{model}}",
  "station_section_connectors": "Connector details",
  "station_section_images": "Station photos",
  "station_last_updated": "Updated: {{time}}",

  "vinfast_detail": "View detail",
  ... (keep existing vinfast_* keys)
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/vi.json src/locales/en.json
git commit -m "feat: add station_* locale keys for provider-agnostic chip strip"
```

---

### Task 5: Build StationInfoChips Component (Tier 1)

**Files:**
- Create: `src/components/StationInfoChips.tsx`
- Create: `src/components/__tests__/StationInfoChips.test.tsx`

- [ ] **Step 1: Write failing tests for StationInfoChips**

Create `src/components/__tests__/StationInfoChips.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StationInfoChips from '../StationInfoChips';

const baseStation = {
  id: 'test-1',
  name: 'Test Station',
  address: '123 Test St',
  province: 'Test',
  latitude: 10.0,
  longitude: 106.0,
  chargerTypes: ['DC_150kW'],
  connectorTypes: ['CCS2', 'Type2_AC'],
  portCount: 4,
  maxPowerKw: 150,
  stationType: 'public' as const,
  isVinFastOnly: true,
  operatingHours: '24/7',
  provider: 'VinFast',
  chargingStatus: 'ACTIVE',
  parkingFee: false,
};

describe('StationInfoChips', () => {
  it('renders all chips when full data is available', () => {
    render(<StationInfoChips station={baseStation} />);
    // Status
    expect(screen.getByText('Available')).toBeDefined();
    // Power
    expect(screen.getByText(/150kW/)).toBeDefined();
    // Connectors
    expect(screen.getByText(/CCS2/)).toBeDefined();
    // Ports
    expect(screen.getByText(/4/)).toBeDefined();
    // Hours
    expect(screen.getByText('24/7')).toBeDefined();
    // Parking
    expect(screen.getByText(/Free parking|Miễn phí/)).toBeDefined();
  });

  it('renders partial chips when data is missing', () => {
    const partial = {
      ...baseStation,
      chargingStatus: null,
      parkingFee: null,
      operatingHours: null,
    };
    render(<StationInfoChips station={partial} />);
    // Power and connectors still render
    expect(screen.getByText(/150kW/)).toBeDefined();
    expect(screen.getByText(/CCS2/)).toBeDefined();
    // Status, parking, hours should NOT render
    expect(screen.queryByText('Available')).toBeNull();
    expect(screen.queryByText('24/7')).toBeNull();
  });

  it('renders BUSY status with correct styling', () => {
    const busy = { ...baseStation, chargingStatus: 'BUSY' };
    render(<StationInfoChips station={busy} />);
    expect(screen.getByText('Busy')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/StationInfoChips.test.tsx`
Expected: FAIL — `StationInfoChips` module not found

- [ ] **Step 3: Create StationInfoChips component**

Create `src/components/StationInfoChips.tsx`:

```tsx
'use client';

import { useLocale } from '@/lib/locale';
import type { ChargingStationData } from '@/types';

interface StationInfoChipsProps {
  readonly station: ChargingStationData;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'text-[var(--color-safe)] bg-[var(--color-safe)]/10',
  Available: 'text-[var(--color-safe)] bg-[var(--color-safe)]/10',
  BUSY: 'text-[var(--color-warn)] bg-[var(--color-warn)]/10',
  UNAVAILABLE: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10',
  INACTIVE: 'text-[var(--color-muted)] bg-[var(--color-surface-hover)]',
};

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === 'ACTIVE' || status === 'Available') return t('station_status_active');
  if (status === 'BUSY') return t('station_status_busy');
  if (status === 'UNAVAILABLE') return t('station_status_unavailable');
  if (status === 'INACTIVE') return t('station_status_inactive');
  return status;
}

export default function StationInfoChips({ station }: StationInfoChipsProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-wrap gap-1.5 items-center" role="list" aria-label="Station information">
      {/* Status badge */}
      {station.chargingStatus && (
        <span
          role="listitem"
          aria-label={`Status: ${statusLabel(station.chargingStatus, t)}`}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[station.chargingStatus] ?? STATUS_STYLES.INACTIVE}`}
        >
          {station.chargingStatus === 'ACTIVE' || station.chargingStatus === 'Available' ? '● ' : ''}
          {statusLabel(station.chargingStatus, t)}
        </span>
      )}

      {/* Power */}
      <span role="listitem" className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-surface-hover)] text-[var(--color-accent)]">
        ⚡ {station.maxPowerKw}kW
      </span>

      {/* Connectors */}
      <span role="listitem" className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-surface-hover)] text-[var(--color-foreground)]">
        {station.connectorTypes.join(' · ')}
      </span>

      {/* Port count */}
      <span role="listitem" className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-surface-hover)] text-[var(--color-foreground)]">
        {t('station_ports', { count: String(station.portCount) })}
      </span>

      {/* Operating hours */}
      {station.operatingHours && (
        <span
          role="listitem"
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            station.operatingHours === '24/7'
              ? 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10'
              : 'bg-[var(--color-surface-hover)] text-[var(--color-foreground)]'
          }`}
        >
          {station.operatingHours === '24/7' ? t('station_hours_24h') : station.operatingHours}
        </span>
      )}

      {/* Parking fee */}
      {station.parkingFee !== null && station.parkingFee !== undefined && (
        <span
          role="listitem"
          className={`text-[10px] px-2 py-0.5 rounded-md ${
            station.parkingFee
              ? 'bg-[var(--color-warn)]/10 text-[var(--color-warn)]'
              : 'bg-[var(--color-safe)]/10 text-[var(--color-safe)]'
          }`}
        >
          {station.parkingFee ? t('station_parking_paid') : t('station_parking_free')}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/StationInfoChips.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/StationInfoChips.tsx src/components/__tests__/StationInfoChips.test.tsx
git commit -m "feat: add StationInfoChips component for Tier 1 chip strip"
```

---

### Task 6: Build StationDetailExpander Component (Tier 2)

**Files:**
- Create: `src/components/StationDetailExpander.tsx`

- [ ] **Step 1: Create StationDetailExpander component**

Create `src/components/StationDetailExpander.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import type { VinFastDetailResponse, VinFastStationDetailData } from '@/types';

interface StationDetailExpanderProps {
  readonly stationId: string;
  readonly stationProvider: string;
}

function DetailContent({ detail }: { readonly detail: VinFastStationDetailData }) {
  const { t } = useLocale();

  return (
    <div className="space-y-2 text-xs mt-2 p-2 bg-[var(--color-surface-hover)]/50 rounded">
      {/* Per-EVSE connector breakdown */}
      {detail.evses.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold mb-1">
            {t('station_section_connectors')}
          </div>
          <div className="space-y-1">
            {detail.evses.map((evse, i) => (
              <div key={i} className="flex items-center gap-2 bg-[var(--color-surface)] rounded px-2 py-1">
                <span className="w-4 h-4 rounded bg-[var(--color-surface-hover)] text-[10px] font-bold flex items-center justify-center text-[var(--color-accent)]">
                  {i + 1}
                </span>
                {evse.connectors.map((c, j) => (
                  <span key={j} className="text-[var(--color-foreground)]">
                    {t('station_connector', {
                      type: c.standard.replace('IEC_62196_', ''),
                      power: String(Math.round(c.max_electric_power / 1000)),
                    })}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hardware info */}
      {detail.hardwareStations.length > 0 && (
        <div className="text-[var(--color-muted)]">
          {t('station_hardware', {
            vendor: detail.hardwareStations[0].vendor,
            model: detail.hardwareStations[0].modelCode,
          })}
        </div>
      )}

      {/* Images */}
      {detail.images.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold mb-1">
            {t('station_section_images')}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {detail.images.slice(0, 3).map((img, i) => (
              <img
                key={i}
                src={img.url}
                alt={`Station photo ${i + 1}`}
                className="w-20 h-14 object-cover rounded"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      )}

      {/* Last updated */}
      {detail.fetchedAt && (
        <div className="text-[10px] text-[var(--color-muted)]">
          {t('station_last_updated', {
            time: new Date(detail.fetchedAt).toLocaleString(),
          })}
        </div>
      )}
    </div>
  );
}

export default function StationDetailExpander({ stationId, stationProvider }: StationDetailExpanderProps) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<VinFastStationDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);

  // Only show for VinFast stations
  if (stationProvider !== 'VinFast') return null;

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // If already loaded, just expand
    if (detail) return;

    // Fetch detail
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/stations/${stationId}/vinfast-detail`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const data: VinFastDetailResponse = await res.json();
      setDetail(data.detail ?? null);
      if (!data.detail) setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className="mt-1 text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]/80 disabled:opacity-50 transition-colors"
      >
        {loading
          ? t('station_detail_loading')
          : expanded
            ? t('station_detail_collapse')
            : t('station_detail_expand')}
      </button>

      {expanded && error && !detail && (
        <div className="mt-1 text-[10px] text-[var(--color-muted)]">
          {t('station_detail_temp_unavailable')}
        </div>
      )}

      {expanded && detail && <DetailContent detail={detail} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/StationDetailExpander.tsx
git commit -m "feat: add StationDetailExpander component for Tier 2 OCPI detail"
```

---

### Task 7: Integrate into TripSummary and Delete Old Component

**Files:**
- Modify: `src/components/TripSummary.tsx:6,227-252`
- Delete: `src/components/VinFastDetailPanel.tsx`
- Modify: `src/locales/vi.json` (remove `vinfast_*` keys)
- Modify: `src/locales/en.json` (remove `vinfast_*` keys)

- [ ] **Step 1: Update TripSummary imports**

In `src/components/TripSummary.tsx`, replace:

```typescript
import VinFastDetailPanel from './VinFastDetailPanel';
```

With:

```typescript
import StationInfoChips from './StationInfoChips';
import StationDetailExpander from './StationDetailExpander';
```

- [ ] **Step 2: Replace inline station info and VinFastDetailPanel**

In `src/components/TripSummary.tsx`, replace the station info section (lines 227-252):

```tsx
                    <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                      <span>⚡ {station.maxPowerKw}kW</span>
                      <span>|</span>
                      <span>{station.connectorTypes.join(', ')}</span>
                      <span>|</span>
                      <span
                        className={
                          station.provider === 'VinFast'
                            ? 'text-[var(--color-safe)]'
                            : 'text-[var(--color-accent)]'
                        }
                      >
                        {station.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1 text-xs bg-[var(--color-accent)] text-[var(--color-background)] rounded-md font-semibold hover:opacity-90 transition-opacity"
                      >
                        {t('navigate')}
                      </a>
                    </div>
                    <VinFastDetailPanel stationId={station.id} stationProvider={station.provider} />
```

With:

```tsx
                    <StationInfoChips station={station} />
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1 text-xs bg-[var(--color-accent)] text-[var(--color-background)] rounded-md font-semibold hover:opacity-90 transition-opacity"
                      >
                        {t('navigate')}
                      </a>
                    </div>
                    <StationDetailExpander stationId={station.id} stationProvider={station.provider} />
```

- [ ] **Step 3: Delete VinFastDetailPanel.tsx**

```bash
rm src/components/VinFastDetailPanel.tsx
```

- [ ] **Step 4: Remove vinfast_* locale keys from both locale files**

Remove these keys from both `src/locales/vi.json` and `src/locales/en.json`:
- `vinfast_detail`
- `vinfast_detail_loading`
- `vinfast_status`
- `vinfast_status_available`
- `vinfast_status_busy`
- `vinfast_status_unavailable`
- `vinfast_ports`
- `vinfast_24h`
- `vinfast_parking_fee`
- `vinfast_no_parking_fee`
- `vinfast_connector`
- `vinfast_hardware`
- `vinfast_detail_unavailable`

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: PASS — no references to VinFastDetailPanel or vinfast_* keys remain

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/TripSummary.tsx src/locales/vi.json src/locales/en.json
git rm src/components/VinFastDetailPanel.tsx
git commit -m "feat: replace VinFastDetailPanel with StationInfoChips + StationDetailExpander

Two-tier station detail card:
- Tier 1: chip strip with status, power, connectors, ports, hours, parking (always visible)
- Tier 2: expandable OCPI detail with per-EVSE specs, hardware, images (VinFast only)
- Eliminates 'Không có thông tin chi tiết' error by using list API data for Tier 1"
```

---

### Task 8: Verify End-to-End and Update Stations API

**Files:**
- Modify: `src/app/api/stations/route.ts:84-88` (if needed)

- [ ] **Step 1: Check that stations API returns new fields**

Read `src/app/api/stations/route.ts`. The API does `...s` spread (line 85), which already includes `chargingStatus` and `parkingFee` from the Prisma model. Verify this by checking the response shape includes these fields.

If the spread doesn't include the new fields (unlikely since they're on the model), add them explicitly:

```typescript
const parsed = stations.map((s) => ({
  ...s,
  chargerTypes: safeJsonArray(s.chargerTypes),
  connectorTypes: safeJsonArray(s.connectorTypes),
}));
```

The `...s` spread already passes through `chargingStatus` and `parkingFee`.

- [ ] **Step 2: Start dev server and test visually**

Run: `npm run dev`

Test scenarios:
1. Plan a trip with VinFast charging stops → verify chip strip shows with status, power, hours, parking
2. Click "Chi tiết ▾" → verify OCPI detail expands (or shows "Tạm thời không khả dụng" gracefully)
3. Plan a trip with non-VinFast stops → verify partial chips show (power, connectors, ports only)
4. Verify mobile responsiveness — chips should wrap to max 2 rows

- [ ] **Step 3: Final commit if any API adjustments needed**

```bash
git add -A
git commit -m "fix: ensure stations API returns chargingStatus and parkingFee fields"
```
