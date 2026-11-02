import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPrismaClient, resolveSslConfig } from './prisma';

vi.mock('@prisma/adapter-pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/adapter-pg')>();
  return {
    ...actual,
    PrismaPg: vi.fn(function (...args: ConstructorParameters<typeof actual.PrismaPg>) {
      return new actual.PrismaPg(...args);
    }),
  };
});

describe('createPrismaClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('constructs a client with a driver adapter for a local connection string (Prisma 7 throws without one)', async () => {
    const client = createPrismaClient('postgresql://u:p@127.0.0.1:1/none');
    expect(client).toBeDefined();
    await client.$disconnect();
  });

  it('constructs a client with a driver adapter for a remote connection string', async () => {
    const client = createPrismaClient('postgresql://u:p@db.example.com:5432/none');
    expect(client).toBeDefined();
    await client.$disconnect();
  });
});

// D1: Prisma 6's engine connected with TLS but did not verify the
// certificate. The pg driver used by the Prisma 7 adapter defaults to no
// TLS at all, which is a silent downgrade for Supabase. Force the old
// behaviour back on — except for local dev/test connections, which never
// speak TLS.
describe('resolveSslConfig (D1: match Prisma 6 TLS behaviour, except local dev/test)', () => {
  it('does not force TLS for localhost', () => {
    expect(resolveSslConfig('postgresql://u:p@localhost:5432/db')).toBeUndefined();
  });

  it('does not force TLS for 127.0.0.1', () => {
    expect(resolveSslConfig('postgresql://u:p@127.0.0.1:5432/db')).toBeUndefined();
  });

  it('enables TLS without certificate verification for a remote host, matching Prisma 6', () => {
    expect(resolveSslConfig('postgresql://u:p@db.supabase.co:6543/db')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('enables TLS without certificate verification when the connection string cannot be parsed', () => {
    expect(resolveSslConfig('not-a-url')).toEqual({ rejectUnauthorized: false });
  });
});

// D8 (security review, HIGH): DATABASE_URL carries `connection_limit=1` for
// Supabase's pooler, but `pg`'s PoolConfig does not recognize that query
// param (pg-pool silently drops it and defaults `max` to 10). Without an
// explicit cap, every cold start could open up to 10 real connections.
describe('createPrismaClient pool size (D8: match Supabase connection_limit=1)', () => {
  afterEach(() => vi.clearAllMocks());

  it('caps the adapter pool at 1 connection', () => {
    createPrismaClient('postgresql://u:p@db.example.com:5432/none');
    expect(PrismaPg).toHaveBeenCalledWith(expect.objectContaining({ max: 1 }));
  });
});

describe('PrismaClient instantiation guard', () => {
  it('no file outside src/lib/prisma.ts calls `new PrismaClient(` (scripts/ is not type-checked)', () => {
    const root = path.resolve(__dirname, '../..');
    const offenders: string[] = [];
    for (const dir of ['src', 'scripts']) {
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
            if (p.endsWith(path.join('src', 'lib', 'prisma.ts'))) continue;
            if (/new PrismaClient\(/.test(readFileSync(p, 'utf8'))) offenders.push(path.relative(root, p));
          }
        }
      };
      walk(path.join(root, dir));
    }
    expect(offenders).toEqual([]);
  });
});
