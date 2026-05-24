/**
 * Guarded wrapper for `prisma db push` (was `npm run db:push`).
 *
 * Renamed to `db:push:local` so the typing itself forces a conscious choice
 * between local and prod every time. The previous one-liner could silently
 * push schema changes to production if `.env` was pointed at the wrong DB.
 *
 * If you really do need to push to production (e.g. disaster-recovery rebuild
 * per docs/RECOVERY.md), set `FORCE_DB_PUSH_TO_PROD=1` to acknowledge.
 */
import { execSync } from 'node:child_process';

const url = process.env.DATABASE_URL ?? '';
const force = process.env.FORCE_DB_PUSH_TO_PROD === '1';
const looksLikeProd = /pooler\.supabase\.com/.test(url);

if (looksLikeProd && !force) {
  console.error('[db:push:local] DATABASE_URL points at a Supabase pooler host.');
  console.error('  Pooler URLs are typically production. Refusing to run `prisma db push`.');
  console.error('  If this is intentional (e.g. disaster-recovery rebuild against a fresh');
  console.error('  Supabase project — see docs/RECOVERY.md), retry with:');
  console.error('    FORCE_DB_PUSH_TO_PROD=1 npm run db:push:local');
  process.exit(1);
}

execSync('npx prisma db push', { stdio: 'inherit' });
