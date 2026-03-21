# Contributing to eVoyage

eVoyage is built entirely by [Claude Code](https://claude.ai/claude-code), Anthropic's AI coding agent. Duy Pham serves as Product Manager — defining features, making design decisions, and ensuring quality. This transparency is a core value of the project.

## How Development Works

All code changes go through Claude Code sessions directed by the PM. There is no traditional contributor workflow with feature branches and pull requests from external developers.

If you're interested in the project:

- **Report bugs** — Open an issue describing the problem, steps to reproduce, and expected behavior
- **Suggest features** — Open an issue with your idea and the problem it solves
- **Discuss** — Start a discussion about the project's direction or design choices

## Development Setup

```bash
git clone https://github.com/phamduy-agilityio/evoyage.git
cd evoyage
npm install
cp .env.example .env.local
# Add your API keys: MINIMAX_API_KEY, MAPBOX_TOKEN (optional)
npm run dev
```

## Quality Standards

Every change must pass before shipping:

- `npm test` — 446+ tests must pass
- `npx next build` — No TypeScript errors
- Locale keys must match between `en.json` and `vi.json`
- All UI must follow [DESIGN.md](./DESIGN.md)

## Code Style

- TypeScript strict mode
- Tailwind CSS for styling (no inline styles, no CSS modules)
- Immutable data patterns — new objects, never mutate
- Small files (200-400 lines, 800 max)
- Colocated tests (`foo.ts` → `foo.test.ts`)

## Project Philosophy

- **Text over icons** — Clear labels, not pictograms
- **No emoji in UI** — Functional elements only
- **Mobile-first** — Designed for drivers on phones
- **Vietnamese-first** — Primary audience, bilingual support
- **Transparency** — Built by AI, managed by a human PM

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
