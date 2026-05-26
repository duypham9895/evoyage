# OpenAI gpt-5 replaces Xiaomi MiMo Flash as primary in the eVi LLM PROVIDER_CHAIN

Decided 2026-05-26. Implemented same day. Roster delta under [ADR-0002](./0002-llm-call-module.md) — chain mechanics (response cleaning, error classification, telemetry shape) unchanged; only `PROVIDER_CHAIN[0]` swaps.

## Context

ADR-0002 established a two-slot provider chain: Xiaomi MiMo Flash (primary, fast/cheap) → Minimax M2.7 (fallback). Two prod quirks have accumulated against the MiMo primary since 2026-05-04:

1. **MiMo Flash leaks Chinese characters into Vietnamese output.** Documented inline in `src/lib/evi/suggestions-client.ts` — the workaround is an explicit `langGuard` appended to every prompt. It works, but it's load-bearing: removing it breaks Vietnamese chips.
2. **M2.7's `<think>` tag and markdown-fence quirks were already handled** by `stripProviderQuirks` in `llm-module.ts`. That logic was load-bearing on the fallback path and a defensive no-op on the primary.

So the primary slot was carrying two prompt-engineering workarounds that the fallback didn't need. The chain abstraction itself held — caller code, telemetry, schema validation, and failover logic are provider-agnostic.

## Decision

Swap `PROVIDER_CHAIN[0]` from `MIMO_PROVIDER` (`mimo-v2-flash`) to `OPENAI_PROVIDER` (`gpt-5`).

- `OPENAI_PROVIDER`: `baseURL: https://api.openai.com/v1`, env `OPENAI_API_KEY`, model `gpt-5`.
- `MIMO_PROVIDER` and its env var `XIAOMI_MIMO_API_KEY` deleted from code. Recoverable via `git log -- src/lib/evi/llm-providers.ts`.
- `MINIMAX_PROVIDER` (M2.7 fallback) unchanged.
- Chain mechanics, `stripProviderQuirks`, error classification, telemetry shape — all unchanged.

## Why

- **gpt-5 respects locale natively.** No Chinese leakage in Vietnamese output observed in spot checks. The `langGuard` becomes defence-in-depth for the M2.7 fallback rather than load-bearing for the primary.
- **gpt-5 emits clean JSON in `response_format: json_object` mode.** No fence wrapping. `stripProviderQuirks` becomes a no-op on the primary; M2.7 fallback still needs it.
- **The chain abstraction earns its keep.** Swapping one provider in a two-provider chain touched 4 source files and zero tests of caller behavior — only assertion strings (`provider=mimo` → `provider=openai`). The Module's Locality win from ADR-0002 paid off here.

## Considered alternatives

- **Keep MiMo, harden language guard further.** Rejected — repeated prompt-level mitigation indicates the model is the wrong fit for Vietnamese single-language output. Adding more guard text increases token cost on every call.
- **Switch primary to gpt-4o-mini for cost.** Rejected — chose gpt-5 for quality headroom on eVi's structured-extraction workload. Cost is monitored via the telemetry `tokens=` field; revisit if it becomes load-bearing on the Vercel invoice.
- **Drop MiniMax fallback (OpenAI-only).** Rejected — OpenAI has had multi-hour outages (most recently Dec 2024). The fallback exists for availability, not quality. Schema validation catches degraded output regardless of provider.
- **Make MiMo the fallback (3-slot chain).** Rejected — Karpathy Rule 2. No caller needs a third slot. Two providers already cover the "one provider down" scenario; adding a third inflates the maintenance surface.

## Consequences

- **ADR-0002 not superseded.** Chain architecture, response cleaning, error classification, and telemetry shape from ADR-0002 still hold. Future provider changes should reference ADR-0002 + this ADR as a pair.
- **New env var required.** `OPENAI_API_KEY` must be set in `.env.local` and on Vercel (Production, Preview, Development). `XIAOMI_MIMO_API_KEY` can be removed from Vercel.
- **`stripProviderQuirks` is now exercised only on fallback.** The `<think>`-tag and markdown-fence stripping logic remains load-bearing for M2.7. Do not delete it.
- **`langGuard` in `suggestions-client.ts` is now defence-in-depth.** Kept because it's still load-bearing on the M2.7 fallback path. Delete only if the fallback is also replaced with a locale-native model.
- **Telemetry labels changed.** Existing dashboard queries / log searches for `provider=mimo` will return no new results. Update operational tooling to expect `provider=openai` on the success path.
- **Cost profile shifts up.** gpt-5 is ~10–20× the per-token cost of `mimo-v2-flash`. Monitor `tokens=` in success logs and on the OpenAI dashboard. The `maxTokens: 2048` cap in `suggestions-client.ts` was set for M2.7's CoT length; it remains a safety net against runaway gpt-5 reasoning.
