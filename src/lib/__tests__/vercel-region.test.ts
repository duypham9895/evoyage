import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The production database is Supabase Postgres in ap-southeast-1 (Singapore),
// see docs/RECOVERY.md. Vercel's matching function region is `sin1`.
// Without a pinned region, functions run in the Vercel default (iad1, US East)
// and every Prisma round trip crosses the Pacific.
describe('Vercel function region', () => {
  const vercelJsonPath = resolve(__dirname, '../../../vercel.json');
  const vercelConfig = JSON.parse(readFileSync(vercelJsonPath, 'utf8')) as {
    regions?: unknown;
  };

  // BUG(p1-vercel-function-region-latency): vercel.json pins no region, so functions run in iad1 far from the ap-southeast-1 DB. See docs/bugs/2026-11-01-p1-vercel-function-region-latency.md
  it('pins serverless functions to sin1, next to the ap-southeast-1 database', () => {
    expect(vercelConfig.regions).toEqual(['sin1']);
  });
});
