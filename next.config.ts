import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' maps.googleapis.com",
              "style-src 'self' 'unsafe-inline' api.mapbox.com",
              "connect-src 'self' *.mapbox.com maps.googleapis.com nominatim.openstreetmap.org router.project-osrm.org overpass-api.de *.supabase.com",
              "img-src 'self' data: blob: *.openstreetmap.org *.googleapis.com *.mapbox.com *.basemaps.cartocdn.com *.vinfastauto.com",
              "font-src 'self'",
              "worker-src 'self' blob:",
              "frame-src 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
