---
name: review
description: eVoyage pre-landing code review checklist — run before committing or opening a PR. Covers SQL/data safety, API input validation and rate limiting, the LLM output trust boundary, SSE streaming safety, locale parity, mobile-first UX, component patterns, and test coverage. Use when reviewing a diff, preparing to land a change, or asked for a pre-PR review of this repo.
---

# eVoyage Pre-Landing Review

Read `checklist.md` in this skill directory and work through it against the current diff.

## How to run it

1. Establish what changed: `git status --short && git diff`
2. Walk **Pass 1 (CRITICAL)** first. Anything it catches blocks landing.
3. Walk **Pass 2 (INFORMATIONAL)**. These are improvements, not blockers.
4. Respect the **DO NOT flag** list at the end — those are settled conventions,
   and re-raising them wastes the author's attention.

## Verification that must accompany the review

A review is not complete on reading alone. Run and paste real output:

```bash
npm test                 # baseline 1467 tests / 133 files
npx tsc --noEmit         # baseline 5 errors (pre-existing test-fixture drift)
npx next build           # must pass
npx eslint src scripts   # baseline 32 problems — more than that is a regression
```

Run `npm ci` first if `node_modules` is absent.

## Note on the checklist's LLM section

`checklist.md` names MiniMax M2.7 as the model behind eVi. Per ADR-0010 the chain is
now **OpenAI gpt-5 primary, MiniMax M2.7 fallback**. The trust-boundary rules apply to
whichever provider answers — validate with Zod, strip `<think>` tags, never trust
AI-generated JSON structure, length-limit suggestion text.
