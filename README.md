# eVoyage

Plan EV road trips across Vietnam with real charging station data. Know exactly where to charge, how long to wait, and whether you'll make it — before you leave.

**Live:** [https://evoyage.duypham.me/](https://evoyage.duypham.me/)

**Built entirely by Claude Code.** Duy Pham is the Product Manager — defining features, making design decisions, and ensuring quality.

## What it does

- Plan routes between any two points in Vietnam with EV-specific constraints
- See real-time charging station availability from VinFast's network plus OSM, EVPower, and crowdsourced sources (<!-- STATIONS_COUNT_START -->19,951+<!-- STATIONS_COUNT_END --> stations across all 34 Vietnamese provinces & cities — auto-updated daily after the crawl)
- See **trip cost** in VND — gasoline vs diesel vs electric, scaled to your route, with V-GREEN free charging applied for VinFast owners through 2029
- Live energy prices auto-updated daily from authoritative sources:
<!-- ENERGY_PRICES_START -->
  - Gasoline RON 95-III: ₫24,150 / liter (Petrolimex)
  - Diesel DO 0,05S: ₫27,650 / liter (Petrolimex)
  - Electricity at home: ₫2,998 / kWh (EVN tier 4 · 201–300 kWh/month)
  - V-GREEN public charging: ₫3,858 / kWh (free for VinFast owners until 2029)
<!-- ENERGY_PRICES_END -->
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
- **AI:** OpenAI gpt-5 (primary) + MiniMax M2.7 (fallback) for the eVi trip assistant — provider chain per ADR-0002. Groq Whisper-large-v3 powers voice input as a fallback to Web Speech.
- **Data:** VinFast API as the primary source (SSE streaming, daily refresh via GitHub Actions cron), augmented by OpenStreetMap, EVPower, and crowdsourced station promotion per ADR-0001.
- **Database:** Prisma + Supabase Postgres (region `ap-southeast-1`)
- **Analytics:** PostHog (gated on `NEXT_PUBLIC_POSTHOG_KEY` — no-op without it)
- **Testing:** Vitest (1304 tests, 115 files), Playwright for E2E (22 tests, 10 spec files on Desktop Chrome)
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
# Required: OPENAI_API_KEY (eVi assistant)
# Optional fallback: MINIMAX_API_KEY
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
