import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, shareCardLimiter } from '@/lib/rate-limit';

const MAX_LOC = 50;

const stopSchema = z.object({
  name: z.string().max(200),
  powerKw: z.number().min(0).max(1000),
  chargeTimeMin: z.number().min(0).max(600),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const requestSchema = z.object({
  locale: z.enum(['vi', 'en']),
  startAddress: z.string().min(1).max(200),
  endAddress: z.string().min(1).max(200),
  totalDistanceKm: z.number().min(0).max(10000),
  totalDurationMin: z.number().min(0).max(6000),
  totalChargingTimeMin: z.number().min(0).max(6000),
  arrivalBatteryPercent: z.number().min(0).max(100),
  startBatteryPercent: z.number().min(0).max(100),
  chargingStops: z.array(stopSchema).max(20),
  polyline: z.string().max(50000).optional(),
});

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s: string, max: number): string {
  const clean = s.replace(/<[^>]*>/g, '');
  return clean.length <= max ? clean : clean.slice(0, max).trimEnd() + '...';
}

function fmtDur(m: number, locale: 'vi' | 'en'): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}${locale === 'vi' ? ' phút' : 'min'}`;
  if (min === 0) return `${h}h`;
  return `${h}h${min}m`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`share-card:${ip}`, 3, 60_000, shareCardLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  const d = parsed.data;
  const totalTime = d.totalDurationMin + d.totalChargingTimeMin;
  const stopsLabel = d.locale === 'vi' ? `${d.chargingStops.length} điểm sạc` : `${d.chargingStops.length} stops`;

  // Build static map URL if Mapbox token available
  let mapUrl: string | null = null;
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapboxToken && d.polyline) {
    try {
      const { simplifyPolyline } = await import('@/lib/polyline-simplify');
      const { decodePolyline } = await import('@/lib/polyline');
      const simplified = simplifyPolyline(d.polyline, 3500);
      const pts = decodePolyline(d.polyline);
      const s = pts[0], e = pts[pts.length - 1];
      const path = `path-3+3b82f6-0.8(${encodeURIComponent(simplified)})`;
      const sm = `pin-s-a+22c55e(${s.lng},${s.lat})`;
      const em = `pin-s-b+ef4444(${e.lng},${e.lat})`;
      const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${path},${sm},${em}/auto/1200x380@2x?access_token=${mapboxToken}&padding=40`;
      if (url.length <= 8192) mapUrl = url;
    } catch { /* skip map */ }
  }

  // Build journey stops HTML
  const stops = d.chargingStops;
  let stopsHtml = '';

  const addRow = (icon: string, color: string, name: string, detail: string) => {
    stopsHtml += `<div style="display:flex;align-items:center;gap:10px;padding:3px 0">
      <span style="width:20px;text-align:center;font-weight:700;font-size:13px;color:${color}">${icon}</span>
      <span style="flex:1;color:#c9d1d9">${esc(trunc(name, MAX_LOC))}</span>
      <span style="color:#8b949e;font-size:13px">${esc(detail)}</span>
    </div>`;
  };

  addRow('A', '#22c55e', d.startAddress, `🔋 ${Math.round(d.startBatteryPercent)}%`);

  if (stops.length > 6) {
    stops.slice(0, 2).forEach(s => addRow('⚡', '#eab308', s.name, `${s.powerKw}kW · ${Math.round(s.chargeTimeMin)}m`));
    addRow('···', '#8b949e', d.locale === 'vi' ? `+${stops.length - 4} điểm dừng khác` : `+${stops.length - 4} more stops`, '');
    stops.slice(-2).forEach(s => addRow('⚡', '#eab308', s.name, `${s.powerKw}kW · ${Math.round(s.chargeTimeMin)}m`));
  } else {
    stops.forEach(s => addRow('⚡', '#eab308', s.name, `${s.powerKw}kW · ${Math.round(s.chargeTimeMin)}m`));
  }

  addRow('B', '#ef4444', d.endAddress, `🔋 ${Math.round(d.arrivalBatteryPercent)}%`);

  const mapSection = mapUrl
    ? `<img src="${esc(mapUrl)}" width="1200" height="380" style="object-fit:cover;display:block" />`
    : `<div style="width:100%;height:380px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#161b22,#0d1117);font-size:28px;color:#484f58">
        ${esc(trunc(d.startAddress, 25))} → ${esc(trunc(d.endAddress, 25))}
      </div>`;

  // Return SVG-based card as HTML that can be rendered client-side
  const cardData = {
    mapUrl,
    startAddress: trunc(d.startAddress, MAX_LOC),
    endAddress: trunc(d.endAddress, MAX_LOC),
    totalDistanceKm: d.totalDistanceKm,
    totalTime: fmtDur(totalTime, d.locale),
    stopsLabel,
    stopsHtml,
    arrivalBatteryPercent: d.arrivalBatteryPercent,
    startBatteryPercent: d.startBatteryPercent,
    locale: d.locale,
  };

  // Return card data as JSON — client renders it
  return NextResponse.json(cardData);
}
