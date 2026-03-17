import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/cron/refresh-stations — Vercel Cron endpoint.
 * Fetches latest station data from Open Charge Map API for Vietnam.
 * Runs weekly (configured in vercel.json).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiKey = process.env.OPEN_CHARGE_MAP_API_KEY ?? '';
    const url = new URL('https://api.openchargemap.io/v3/poi/');
    url.searchParams.set('output', 'json');
    url.searchParams.set('countrycode', 'VN');
    url.searchParams.set('maxresults', '5000');
    url.searchParams.set('compact', 'true');
    url.searchParams.set('verbose', 'false');
    if (apiKey) {
      url.searchParams.set('key', apiKey);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`OCM API error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Unexpected OCM API response format');
    }

    let upserted = 0;

    for (const poi of data) {
      const addressInfo = poi.AddressInfo;
      if (!addressInfo?.Latitude || !addressInfo?.Longitude) continue;

      const operatorTitle = poi.OperatorInfo?.Title ?? 'Unknown';
      const isVinFast =
        operatorTitle.toLowerCase().includes('vinfast') ||
        operatorTitle.toLowerCase().includes('v-green');

      // Extract connector types
      const connections = poi.Connections ?? [];
      const connectorTypes: string[] = [];
      const chargerTypes: string[] = [];
      let maxPower = 0;
      let portCount = 0;

      for (const conn of connections) {
        const typeName = conn.ConnectionType?.Title ?? '';
        if (typeName.includes('CCS')) connectorTypes.push('CCS2');
        else if (typeName.includes('CHAdeMO')) connectorTypes.push('CHAdeMO');
        else if (typeName.includes('Type 2')) connectorTypes.push('Type2_AC');
        else if (typeName) connectorTypes.push(typeName);

        const power = conn.PowerKW ?? 0;
        if (power > 0) {
          chargerTypes.push(power >= 20 ? `DC_${power}kW` : `AC_${power}kW`);
        }
        if (power > maxPower) maxPower = power;

        portCount += conn.Quantity ?? 1;
      }

      const ocmId = String(poi.ID);

      await prisma.chargingStation.upsert({
        where: { ocmId },
        update: {
          name: addressInfo.Title ?? `Station ${ocmId}`,
          address: [addressInfo.AddressLine1, addressInfo.Town, addressInfo.StateOrProvince]
            .filter(Boolean)
            .join(', '),
          province: addressInfo.StateOrProvince ?? addressInfo.Town ?? 'Unknown',
          latitude: addressInfo.Latitude,
          longitude: addressInfo.Longitude,
          chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
          connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
          portCount: portCount || 1,
          maxPowerKw: maxPower || 22,
          stationType: poi.UsageType?.IsPayAtLocation ? 'public' : 'public',
          isVinFastOnly: isVinFast,
          provider: isVinFast
            ? 'VinFast'
            : operatorTitle.includes('EverCharge')
              ? 'EverCharge'
              : operatorTitle.includes('EVONE')
                ? 'EVONE'
                : operatorTitle.includes('EVPower')
                  ? 'EVPower'
                  : operatorTitle.includes('CHARGE+')
                    ? 'CHARGE+'
                    : 'Other',
          scrapedAt: new Date(),
        },
        create: {
          ocmId,
          name: addressInfo.Title ?? `Station ${ocmId}`,
          address: [addressInfo.AddressLine1, addressInfo.Town, addressInfo.StateOrProvince]
            .filter(Boolean)
            .join(', '),
          province: addressInfo.StateOrProvince ?? addressInfo.Town ?? 'Unknown',
          latitude: addressInfo.Latitude,
          longitude: addressInfo.Longitude,
          chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
          connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
          portCount: portCount || 1,
          maxPowerKw: maxPower || 22,
          stationType: 'public',
          isVinFastOnly: isVinFast,
          provider: isVinFast ? 'VinFast' : 'Other',
          scrapedAt: new Date(),
        },
      });

      upserted++;
    }

    return NextResponse.json({
      success: true,
      stationsProcessed: upserted,
      totalFromAPI: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Station refresh error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
