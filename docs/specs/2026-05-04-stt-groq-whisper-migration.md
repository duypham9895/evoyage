# Voice Input STT — Migrate from MiniMax to Groq Whisper

**Status**: Shipping (drafted 2026-05-04)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: Hotfix on top of the eVi voice input feature (`2026-03-20-evi-ai-trip-assistant-design.md`). Sister to the same-day MiMo chat migration (`2026-05-04-mimo-primary-minimax-fallback-design.md`); this spec only covers the STT surface (`/api/transcribe`).

## 1. Problem

Voice input was completely broken in production. Live debugging on 2026-05-04 surfaced two compounding faults at the MiniMax STT layer:

1. **MiniMax dropped public STT.** Their current API docs (https://platform.minimax.io/docs/llms.txt) list T2A, voice cloning, and voice design — but no speech-to-text endpoint. `POST https://api.minimax.io/v1/stt/create` now returns a generic `404 page not found` (route-level, not auth). Confirmed in Vercel function logs: `[transcribe] MiniMax create failed: 404`.
2. **MiniMax API key auth is broken globally.** `MINIMAX_API_KEY` from Vercel production env returns `status_code 1004 login fail` even on `/v1/models`, not just STT. eVi chat keeps working only because PR #9 already routed chat to MiMo Flash earlier today. STT had no such fallback.

Either fault alone would have killed voice input. With both, no patch to the existing route can recover it — the upstream service is gone.

## 2. Goal

Replace the MiniMax STT call in `src/app/api/transcribe/route.ts` with a working free-tier provider that fits eVoyage's $0-infra constraint.

**Verifiable outcome**:
- Hard-reload of `/plan` in any modern browser → tap mic → speak Vietnamese → transcript flows into eVi chat in <2s.
- `npm test` passes (existing 1,178+ count plus 9 new transcribe-route tests covering Groq behavior).
- Vercel function logs show `200 OK` for `POST /api/transcribe`, no 404/500.

## 3. Non-goals

- Touching `src/lib/evi/*` (chat path) — already migrated to MiMo in PR #9.
- Removing `MINIMAX_API_KEY` env var — still consumed as chat fallback by `llm-call.ts`.
- Adding a configurable STT provider switch via env. We pick one provider and ship; if Groq's free tier ever changes, swap is a 2-line edit (base URL + key var).
- Streaming partial transcripts. Whisper-large-v3 returns final-only; live transcription remains a Web Speech-only feature for browsers that support it.
- Browser-side Whisper.wasm. Bundle bloat (>50MB) is too much for a feature most users hit once.

## 4. Provider research summary

Confirmed against `https://console.groq.com/docs/speech-to-text` and `https://console.groq.com/docs/model/whisper-large-v3` (2026-05-04):

- **Base URL**: `https://api.groq.com/openai/v1` — OpenAI-compatible, drops into the `openai` npm SDK we already import for MiMo.
- **Endpoint**: `POST /audio/transcriptions` (single synchronous request, no polling).
- **Auth**: `Authorization: Bearer $GROQ_API_KEY`.
- **Model picked**: `whisper-large-v3` — best Vietnamese accuracy (turbo variant trades quality for speed; both are sub-second so we prefer quality).
- **Free tier**: 2,000 requests/day, 7,200 audio-seconds/hour. At a ~5s typical voice query, that's ~1,440 prompts/hour — comfortably above any plausible eVoyage launch-day traffic.
- **Latency**: <1s typical (Groq LPU). Old MiniMax flow polled for 5–15s; this is a UX upgrade, not a regression.
- **File limits**: 25MB max audio, common formats supported (webm, mp4, wav, mp3, ogg). Our existing 5MB client cap is well below.
- **Vietnamese**: officially supported in whisper-large-v3's 100+ language matrix.

## 5. Architecture

Single file changed: `src/app/api/transcribe/route.ts`. The hook (`useSpeechInput.ts`) and engine (`whisper-engine.ts`) are unchanged — they already POST to `/api/transcribe` with the same `audio` + `locale` form fields.

```
Old: route → fetch /v1/stt/create (job) → poll /v1/stt/{id} until succeeded → JSON.text
New: route → openai.audio.transcriptions.create({ file, model, language }) → JSON.text
```

## 6. Code change

`src/app/api/transcribe/route.ts` — full rewrite, ~80 lines (down from ~165). Reads `GROQ_API_KEY`, validates the same input contract (audio file ≤5MB, locale `vi-VN`/`en-US`), calls Groq once, returns `{ text }`. `maxDuration` drops from 30s to 15s. Error mapping:

| Groq response | Route response | Client error code |
|---|---|---|
| `200 { text }` | `200 { text }` | (success) |
| `401 Invalid API Key` | `503 provider_unavailable` | `transcription_failed` |
| Any other failure | `500 transcription_failed` | `transcription_failed` |

The `provider_unavailable` mapping for 401 lets us distinguish "we forgot to set the key in Vercel" from "Groq had a bad day" in monitoring without leaking auth details to the client.

## 7. Tests

`src/app/api/transcribe/route.test.ts` — rewritten to mock `global.fetch` (which the OpenAI SDK calls under the hood). 9 cases: missing key, missing audio, invalid locale, oversized file, success path, endpoint+auth assertion, generic Groq error, 401 → `provider_unavailable`, null transcript → empty string.

## 8. Manual rollout steps

Cannot ship via code alone — Groq key must exist in Vercel:

1. `console.groq.com` → create API key.
2. `vercel env add GROQ_API_KEY production` (paste key when prompted).
3. Repeat for `preview` and `development`.
4. Add to local `.env.local` for dev: `GROQ_API_KEY=gsk_...`.
5. Merge this PR → Vercel auto-deploys → hard-reload `/plan` and test voice.

## 9. Rollback plan

If Groq misbehaves: revert this commit. Voice input goes back to broken (the prior state was already broken, so no regression). Then either:
- Restore the MiniMax flow (won't help — endpoint still 404 + key still rejected); OR
- Swap base URL to `https://api.openai.com/v1` and key var to `OPENAI_API_KEY` for paid OpenAI Whisper at $0.006/min — same code shape, just two-line edit.

## 10. Decision log

- **Why Groq, not OpenAI Whisper paid?** $0 constraint per `feedback_zero_infra_cost.md`. Groq's free tier covers our usage with comfortable margin.
- **Why whisper-large-v3, not turbo?** Both are sub-second on Groq's LPU. Vietnamese tonal accuracy matters more than the marginal speed difference.
- **Why drop polling?** Groq returns synchronously in <1s. The old async-job pattern was MiniMax's design constraint, not ours.
- **Why server-side, not browser whisper.wasm?** Bundle bloat. eVoyage already has a heavy Mapbox+Leaflet payload; +50MB for STT a user might not even use is unjustifiable.
