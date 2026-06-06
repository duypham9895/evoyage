# eVoyage Logo Brief

Date: 2026-06-06
Status: Approved direction, productionized in app chrome

## Product Understanding

eVoyage is a Vietnam-first EV trip planner. Its core promise is not simply "find chargers"; it gives drivers confidence before they leave by combining realistic range, route planning, charging stops, station compatibility, trip cost, fallback alternatives, and the eVi assistant.

The brand should feel like a trusted navigation instrument with a warm Vietnamese voice. It should be precise enough for battery and route decisions, but not cold like a generic SaaS dashboard.

## Logo Principles

1. Trust before decoration. The mark should communicate confidence, route control, and range safety.
2. Vietnam-specific, not tourist-Vietnam. Avoid flags, maps as literal decoration, lotus shapes, and generic travel symbols.
3. EV without the cliche. Avoid lightning bolts, plug icons, car silhouettes, and battery pictograms as the main identity.
4. Text-first compatibility. The current product relies on a compact wordmark in nav, so the system needs a strong wordmark and a small standalone app icon.
5. Works on dark surfaces. The mark must hold up on `#0F0F11`, `#1A1A1F`, and landing navy.

## Recommended Direction: Route E

The recommended logo turns the lowercase `e` into a continuous planned route. It keeps the existing `eVoyage` recognition, but makes the `e` ownable: a route loop, a crossbar, and one endpoint dot. The shape says "a trip has been calculated" rather than "electricity."

Why it fits:

- `e`: keeps current brand recognition and eVi adjacency.
- Route loop: stands for trip planning, not a generic charger directory.
- Endpoint dot: implies a charging stop or safe arrival without becoming an icon grid element.
- Rounded stroke: warm and human.
- Geometric construction: precise, instrument-panel compatible.

## Other Explored Directions

### Range Halo

An instrument-gauge mark around the `e`. This is strong for safety and battery confidence, but it risks feeling more like a dashboard widget than a travel brand.

### Vietnam Thread

A vertical route inspired by Vietnam's north-south journey shape. This is the most local concept, but it is weaker at small sizes and could become too map-like for a primary logo.

## Visual Tokens

- Background: `#0F0F11`
- Surface: `#1A1A1F`
- Accent: `#00D4AA`
- Accent dim: `#00A888`
- Foreground: `#E8E8ED`
- Muted: `#6B6B78`
- Heading/wordmark font: Space Grotesk 700

## Next Step

Route E has been promoted into production assets:

- `public/icons/icon.svg` for PWA icon
- `src/app/icon.svg` for App Router icon metadata
- shared wordmark component for `LandingNavbar` and `Header`
- optional compact mark for cramped mobile surfaces
