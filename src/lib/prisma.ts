import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// D1: Prisma 6's engine connected over TLS but did not verify the server
// certificate. The pg driver behind the Prisma 7 adapter defaults to no TLS
// at all, which Supabase refuses when "Enforce SSL" is on. Restore the old
// behaviour — except for local dev/test connections, which never speak TLS.
export function resolveSslConfig(connectionString: string): { rejectUnauthorized: false } | undefined {
  try {
    const { hostname } = new URL(connectionString);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined;
  } catch {
    // Unparsable connection string: fall through to the secure default below.
  }
  return { rejectUnauthorized: false };
}

// Prisma 7 requires a driver adapter. DATABASE_URL is the Supabase pooler
// (6543); pg uses unnamed prepared statements, so transaction mode is safe.
//
// D8: DATABASE_URL carries `connection_limit=1` for the pooler, but `pg`'s
// PoolConfig does not recognize that query param — it's silently dropped,
// and pg-pool defaults `max` to 10. Cap it explicitly so a cold start can't
// open more than the one connection Supabase's plan allows.
export function createPrismaClient(connectionString = process.env.DATABASE_URL ?? ''): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, ssl: resolveSslConfig(connectionString), max: 1 }),
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
