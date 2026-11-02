import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7: the CLI (generate, db push, migrate diff) reads its connection
// from here, not from schema.prisma. Use the DIRECT (non-pooled, 5432) URL —
// this is what `directUrl` used to do. Runtime queries use DATABASE_URL via
// the adapter in src/lib/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
});
