# Station Detail Card Redesign

## Problem

VinFast charging station detail shows "Không có thông tin chi tiết" (No detailed info) because:

1. **Cron job hardcodes generic values** — `portCount: 4`, `maxPowerKw: 150`, `connectorTypes: ['CCS2', 'Type2_AC']` for all stations, ignoring per-station data from VinFast list API
2. **On-demand detail fetch is unreliable** — Cloudflare blocks the VinFast detail API (vinfastauto.com/get-locator), causing `detail: null` responses
3. **Available data is discarded** — VinFast list API provides `charging_status`, `open_time_service`, `close_time_service`, `parking_fee`, `access_type` but these are partially thrown away during cron import

## Solution

**Progressive enhancement with two-tier display:**

- **Tier 1 (always visible):** Show key decision data from the list API in a horizontal chip strip. Zero API calls, instant render, never shows "No info"
- **Tier 2 (on-demand expansion):** Fetch OCPI-level detail (per-EVSE connectors, hardware, images) when user taps "Chi tiết". Cache aggressively (24h TTL). Graceful degradation if blocked

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Display model | Two-tier inline (chip strip + expandable detail) | Supports all 3 driver needs: decide, navigate, compare — without modal context-switch |
| Tier 1 layout | Horizontal chip strip (Option A) | Mobile-first, wraps naturally, scannable, extensible |
| Data strategy | Progressive enhancement (B) + aggressive caching (D) | List API data always available; detail fetch is bonus, not blocker |
| Provider scope | Provider-agnostic component | Chip strip works for all stations, not just VinFast. Tier 2 is VinFast-only |
| Error handling | Quiet degradation | No red error badges. Missing detail = "Tạm thời không khả dụng" in muted text |

## Data Architecture

### New fields in `ChargingStation` schema (Prisma)

```prisma
model ChargingStation {
  // ... existing fields ...
  chargingStatus  String?   // "ACTIVE", "BUSY", "UNAVAILABLE", "INACTIVE"
  parkingFee      Boolean?  // true = paid, false = free, null = unknown
}
```

Note: `accessType` is NOT added as a new column — the existing `stationType` field already stores this data (derived from `access_type` in the cron job: `'public'` or `'restricted'`). Reuse `stationType` for the access type chip.

### Updated `ChargingStationData` type (`src/types/index.ts`)

```typescript
export interface ChargingStationData {
  // ... existing fields ...
  readonly chargingStatus: string | null;  // NEW
  readonly parkingFee: boolean | null;     // NEW
}
```

All consumers of `ChargingStationData` (`ChargingStop`, `RankedStation`, `ScoreStationInput`, `ChargingStopWithAlternatives`) inherit these fields automatically via composition. The stations API route (`/api/stations/route.ts`) must include these fields in its response mapping.

### Cron job changes (`refresh-vinfast/route.ts`)

Store data from VinFast list API instead of hardcoding:

| Field | Current (hardcoded) | New (from list API) |
|-------|--------------------|-----------------------------|
| `operatingHours` | Stored but underused | `"07:00 - 22:00"` or `"24/7"` from `open_time_service`/`close_time_service` |
| `chargingStatus` | Not stored | `charging_status` → "ACTIVE", "BUSY", etc. |
| `parkingFee` | Not stored | `parking_fee` → boolean |

Note: `access_type` already maps to existing `stationType` field — no new column needed.

#### 24/7 detection logic

When storing `operatingHours`, detect 24/7 stations explicitly:
- If `open_time_service === '00:00'` and `close_time_service === '23:59'`, store `"24/7"`
- If both `open_time_service` and `close_time_service` are empty/null, store `null`
- Otherwise store `"{open_time_service} - {close_time_service}"`

Note: `portCount`, `maxPowerKw`, `connectorTypes` remain defaults (4, 150, ['CCS2', 'Type2_AC']) since the list API doesn't provide per-station values. These get corrected when Tier 2 detail is fetched and cached.

### Cache strategy change

- Detail cache TTL: 6 hours → **24 hours** (connector specs rarely change)
- Successful detail fetches cached and reused across all users
- Cache fills organically over time as users view stations

#### Staleness tolerance

Tier 1 data (`chargingStatus`, `operatingHours`, `parkingFee`) refreshes daily via cron. This means status could be up to 24h stale. This is acceptable for MVP — real-time availability tracking is a future feature. No staleness indicator needed in Tier 1.

#### Data migration on deploy

After schema migration, all existing rows will have `chargingStatus = null`, `parkingFee = null`. To avoid a temporary degraded experience:
- **Run the VinFast cron job immediately after migration** (trigger manually via Vercel dashboard or `curl` the cron endpoint with the `CRON_SECRET`)
- This populates the new fields for all ~2000 VinFast stations within minutes

## UI Component Design

### Component hierarchy

```
TripSummary
  └─ (inline per stop — logical grouping, not separate component files)
       ├─ Stop header (badge, name, address)
       ├─ Battery row (30% → 80% · ~16min)
       ├─ StationInfoChips (NEW component — Tier 1, all providers)
       ├─ StationDetailExpander (NEW component — Tier 2, VinFast only)
       └─ Action buttons (Navigate + Detail toggle — inline in TripSummary)
```

Note: Only `StationInfoChips` and `StationDetailExpander` are new component files. The rest remains inline in `TripSummary.tsx`.

### `StationInfoChips` — Tier 1 (replaces current inline text)

Horizontal chip strip showing key decision data:

```
[● Sẵn sàng] [⚡ 150kW] [🔌 CCS2 · Type2] [4 cổng] [24/7] [Đỗ xe miễn phí]
```

Chips are conditional — only render if data exists:

| Chip | Source field | Styling |
|------|-------------|---------|
| Status badge | `chargingStatus` | Green (ACTIVE), Yellow (BUSY), Red (UNAVAILABLE), Gray (INACTIVE) |
| Power | `maxPowerKw` | Accent color, ⚡ icon |
| Connectors | `connectorTypes` | Default color, 🔌 icon |
| Port count | `portCount` | Default color |
| Hours | `operatingHours` | Blue badge if 24/7, text otherwise |
| Parking | `parkingFee` | Green "Miễn phí" / Yellow "Có phí" |

If a field is null/undefined, the chip doesn't render. No error states.

### `StationDetailExpander` — Tier 2 (replaces `VinFastDetailPanel`)

Only renders for VinFast stations. Triggered by "Chi tiết ▾" button.

**Content when expanded:**
- Per-EVSE connector breakdown with power specs (kW)
- Hardware vendor and model
- Station images (up to 3, from VinFast CDN)
- Last updated timestamp
- Access type

**States:**
- Hidden (default)
- Loading (spinner inside expand area, Tier 1 chips stay visible)
- Loaded (detail content shown)
- Failed (muted text: "Tạm thời không khả dụng")

**Retry behavior:** Failed state resets on component remount. User can retry by collapsing and re-expanding, or by re-planning the trip.

### Deleted components

- `VinFastDetailPanel.tsx` — replaced by `StationInfoChips` + `StationDetailExpander`

## State Matrix

| Scenario | Tier 1 chips | Tier 2 button | Tier 2 content |
|----------|-------------|---------------|----------------|
| VinFast station, fresh cron data | Full (status, power, hours, parking, ports, connectors) | "Chi tiết ▾" | Fetches on tap |
| VinFast station, detail cached | Full | "Chi tiết ▾" | Instant from cache |
| VinFast station, detail fetch fails | Full (unchanged) | Disabled | "Tạm thời không khả dụng" |
| Non-VinFast station (OSM/GMaps) | Partial (power, connectors, ports) | Hidden | N/A |

## Locale Strings

Replace `vinfast_*` keys with provider-agnostic `station_*` keys:

| Key | VI | EN |
|-----|----|----|
| `station_status_active` | Sẵn sàng | Available |
| `station_status_busy` | Đang bận | Busy |
| `station_status_unavailable` | Không khả dụng | Unavailable |
| `station_status_inactive` | Ngừng hoạt động | Inactive |
| `station_hours_24h` | 24/7 | 24/7 |
| `station_parking_free` | Đỗ xe miễn phí | Free parking |
| `station_parking_paid` | Có phí đỗ xe | Parking fee |
| `station_ports` | {{count}} cổng | {{count}} ports |
| `station_detail_expand` | Chi tiết ▾ | Details ▾ |
| `station_detail_collapse` | Thu gọn ▴ | Collapse ▴ |
| `station_detail_loading` | Đang tải... | Loading... |
| `station_detail_temp_unavailable` | Tạm thời không khả dụng | Temporarily unavailable |
| `station_connector` | {{type}} · {{power}}kW | {{type}} · {{power}}kW |
| `station_hardware` | Thiết bị: {{vendor}} {{model}} | Hardware: {{vendor}} {{model}} |
| `station_section_connectors` | Chi tiết các cổng sạc | Connector details |
| `station_section_images` | Hình ảnh trạm | Station photos |
| `station_last_updated` | Cập nhật: {{time}} | Updated: {{time}} |

Old `vinfast_*` keys must be removed in the **same commit** as deleting `VinFastDetailPanel.tsx` to avoid runtime errors.

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `chargingStatus`, `parkingFee` fields |
| `src/app/api/cron/refresh-vinfast/route.ts` | Store list API data instead of hardcoding |
| `src/app/api/stations/[id]/vinfast-detail/route.ts` | Increase cache TTL to 24h |
| `src/components/VinFastDetailPanel.tsx` | Delete — replaced by new components |
| `src/components/StationInfoChips.tsx` | New — Tier 1 chip strip |
| `src/components/StationDetailExpander.tsx` | New — Tier 2 expandable detail |
| `src/components/TripSummary.tsx` | Replace VinFastDetailPanel with new components |
| `src/types/index.ts` | Add new fields to station types |
| `src/locales/vi.json` | Add `station_*` keys, remove `vinfast_*` keys |
| `src/locales/en.json` | Add `station_*` keys, remove `vinfast_*` keys |

## Success Criteria

1. **No "Không có thông tin chi tiết" error** — Tier 1 chips always render from DB data
2. **All VinFast stations show** status, power, hours, parking, ports, connectors without requiring detail fetch
3. **Non-VinFast stations** show available chips (power, connectors, ports) without errors
4. **Detail expansion** works when VinFast API is reachable, degrades gracefully when blocked
5. **Mobile-responsive** — chip strip wraps naturally on narrow screens, max 2 rows (status and power chips have priority)
6. **Accessible** — status chips include text labels (not color-only), use `aria-label` for screen readers
