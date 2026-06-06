import type { NextConfig } from "next";

// Note: Content-Security-Policy moved out of next.config.ts to src/middleware.ts
// in 2026-05-24 so the policy can carry a per-request nonce (script-src
// 'nonce-…' instead of 'unsafe-inline'). Other static security headers stay
// here because they don't need per-request data.

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'evoyagevn.vercel.app' }],
        destination: 'https://evoyage.duypham.me/:path*',
        permanent: true,
      },
    ];
  },
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
        ],
      },
    ];
  },
};

export default nextConfig;
