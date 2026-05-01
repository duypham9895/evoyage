# eVoyage

Plan EV road trips across Vietnam with real charging station data. Know exactly where to charge, how long to wait, and whether you'll make it — before you leave.

**Live:** [https://evoyagevn.vercel.app/](https://evoyagevn.vercel.app/)

**Built entirely by Claude Code.** Duy Pham is the Product Manager — defining features, making design decisions, and ensuring quality.

## What it does

- Plan routes between any two points in Vietnam with EV-specific constraints
- See real-time charging station availability from VinFast's network (<!-- STATIONS_COUNT_START -->18,000+<!-- STATIONS_COUNT_END --> stations, 63 provinces — auto-updated daily after the crawl)
- See **trip cost** in VND — electricity vs gasoline equivalent so you know your savings before you leave
- Report station status with one tap (Working / Broken / Busy) — community-verified data
- Get AI-powered trip planning via eVi — describe your trip in natural language and let AI fill in the details
- Compare alternative charging stations ranked by speed, detour time, and cost
- Resilient routing — automatic Mapbox fallback when OSM routing is degraded
- Support for 15+ EV models (VinFast, BYD, Tesla, and custom vehicles)
- Bilingual interface (Vietnamese and English)
- Works great on mobile — designed for drivers on the go

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Maps:** Mapbox + OpenStreetMap via Leaflet
- **Routing:** OSRM (primary) with Mapbox Directions fallback
- **AI:** MiniMax M2.7 for eVi trip assistant (route narratives, follow-up suggestions)
- **Data:** VinFast API for real-time charging station data (SSE streaming, daily refresh via GitHub Actions cron)
- **Database:** Prisma + Supabase Postgres (region `ap-southeast-1`)
- **Analytics:** PostHog (gated on `NEXT_PUBLIC_POSTHOG_KEY` — no-op without it)
- **Testing:** Vitest (713 tests, 53 files), Playwright for E2E (10 spec files)
- **Quality gate:** husky + lint-staged pre-commit hook runs ESLint on staged `.ts/.tsx` files
- **Design System:** [DESIGN.md](./DESIGN.md) — colors, typography, spacing, component rules
- **Deployment:** Vercel

## Getting Started

```bash
# Clone and install
git clone https://github.com/duypham9895/evoyage.git
cd evoyage
npm install

# Set up environment variables in .env.local
# Required: DATABASE_URL, DIRECT_URL (Supabase Postgres)
# Required: MINIMAX_API_KEY (eVi assistant)
# Optional: MAPBOX_TOKEN (richer basemap)

# Push schema and seed reference data
npm run db:push
npm run seed:all

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

`npm run seed:all` runs both `seed` (15 EV models) and `seed:stations` (OpenStreetMap charging stations). To also load the full VinFast network, run `npx tsx scripts/crawl-vinfast-stations.ts` separately — it takes a few minutes.

## Disaster Recovery

If the production database is paused, deleted, or corrupted, see [docs/RECOVERY.md](./docs/RECOVERY.md) for the full runbook (severity levels, step-by-step rebuild, post-recovery checklist).

## Development

```bash
# Run tests (mandatory before every commit)
npm test

# Build for production
npx next build

# Check locale key sync
npm test -- --run src/lib/__tests__/locale-keys.test.ts
```

See [CLAUDE.md](./CLAUDE.md) for full project instructions, testing rules, and coding standards.

## License

MIT
