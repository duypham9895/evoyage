# VinFast Station Detail — Hybrid On-Demand Fetch

## Problem
Bulk VinFast data (finaldivision API) lacks per-charger specs, real-time availability, images, and proper address breakdowns. The VinFast detail API (`/get-locator/{entity_id}`) has this data but is behind Cloudflare.

## Solution
On-demand detail fetch when a user selects a VinFast station in their trip plan. Uses `impit` (Rust-based TLS impersonation) to bypass Cloudflare. Cached for 6 hours. Graceful fallback to DB data on failure.

## Architecture

```
User clicks VinFast station in trip
  → GET /api/stations/[id]/vinfast-detail
    → Check VinFastStationDetail cache (6h TTL)
      → HIT: return cached detail
      → MISS: call VinFast API via impit
        → SUCCESS: parse OCPI data, cache, return
        → FAIL: return basic data from ChargingStation table
```

## Components

### 1. `impit` TLS Client (`src/lib/vinfast-client.ts`)
- Uses `impit` with Chrome impersonation
- 2-step CF bypass: visit main page → call detail API
- Session cookies reused across requests
- Timeout: 15s per request

### 2. API Endpoint (`src/app/api/stations/[id]/vinfast-detail/route.ts`)
- Rate limited: 20 req/min per IP
- Only works for VinFast stations (ocmId starts with `vinfast-`)
- Returns parsed OCPI data or fallback

### 3. Cache Model (`VinFastStationDetail` in Prisma)
- Key: `entityId` (from VinFast)
- Stores: raw JSON response + parsed fields
- TTL: 6 hours
- Cleaned up by existing cron or on-read expiry

### 4. UI Integration (`TripSummary.tsx`)
- "View details" button on VinFast stations
- Lazy-loads detail on click
- Shows: connectors, real-time status, images, operating hours

## Data Mapping

VinFast OCPI → App fields:
- `evses[].connectors[].standard` → connector type (IEC_62196_T2 = Type2)
- `evses[].connectors[].max_electric_power` → power in watts → kW
- `extra_data.depot_status` → real-time availability
- `images[].url` → station photos
- `opening_times.twentyfourseven` → 24/7 flag
- `data.province` / `data.district` / `data.commune` → proper Vietnamese address
