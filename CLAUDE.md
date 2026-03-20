# eVoyage — Project Instructions

## UI/UX Design Philosophy

### Less Icons, More Humanity

This app should feel warm and human, not like a robotic SaaS dashboard.

**Rules:**
- **No decorative icons** — Don't add icons just to fill space or "look professional." If removing an icon doesn't hurt comprehension, remove it.
- **Text over icons** — Prefer clear, well-written text labels over icon + label combos. Words are more human than pictograms.
- **Functional icons only** — Icons are allowed when they serve a clear interaction purpose: navigation arrows, close buttons, status indicators, map markers. If the user needs the icon to understand what to do, keep it.
- **No icon grids** — Avoid the pattern of "icon in a circle + title + description" repeated 6 times. Use typography, spacing, and color to create visual hierarchy instead.
- **Emoji sparingly** — Emoji are OK for compact UI elements (tabs, chips) where space is tight. Don't use emoji as section decorations or headings.
- **Transparency section uses text, not icons** — The "Built with AI" section should feel honest and personal, not decorated.

**Why:** Icons at scale create visual noise and make everything look the same. The app's personality comes from its words, layout, and the care put into micro-interactions — not from a grid of SVG shapes.

**How to apply:** Before adding any icon, ask: "Would this section work with just text and good typography?" If yes, skip the icon.

## Transparency

eVoyage is built entirely by Claude Code (Anthropic's AI coding agent). Duy Phạm's role is Product Manager — defining features, making design decisions, and ensuring quality. This transparency is a core value of the project and should be reflected honestly in the UI.

## Writing Style (Vietnamese)

When writing Vietnamese copy, refer to the creator as "Duy" (not "Mình" or "Tôi"). Use third-person voice for transparency and professionalism.

## Tech Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Mapbox + OpenStreetMap for maps
- VinFast API for charging station data
- Bilingual: Vietnamese (vi) and English (en) via JSON locale files
