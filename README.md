# eVoyage

Plan EV road trips across Vietnam with real charging station data. Know exactly where to charge, how long to wait, and whether you'll make it — before you leave.

**Built entirely by Claude Code.** Duy Pham is the Product Manager — defining features, making design decisions, and ensuring quality. [Read about the transparency philosophy.](https://evoyage.vercel.app)

## What it does

- Plan routes between any two points in Vietnam with EV-specific constraints
- See real-time charging station availability from VinFast's network (150+ stations, 63 provinces)
- Get AI-powered trip planning via eVi — describe your trip in natural language and let AI fill in the details
- Compare alternative charging stations ranked by speed, detour time, and cost
- Support for 15+ EV models (VinFast, BYD, Tesla, and custom vehicles)
- Bilingual interface (Vietnamese and English)
- Works great on mobile — designed for drivers on the go

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Maps:** Mapbox + OpenStreetMap via Leaflet
- **AI:** MiniMax M2.7 for eVi trip assistant (route narratives, follow-up suggestions)
- **Data:** VinFast API for real-time charging station data (SSE streaming)
- **Testing:** Vitest (449 tests), Playwright for E2E
- **Deployment:** Vercel

## Getting Started

```bash
# Clone and install
git clone https://github.com/phamduy-agilityio/evoyage.git
cd evoyage
npm install

# Set up environment variables
cp .env.example .env.local
# Add your API keys: MINIMAX_API_KEY, MAPBOX_TOKEN (optional)

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

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
