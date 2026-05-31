# Precautionary Stops Rollout

## Gate

Roll out only after Slice 4 dismissal persistence is approved and merged. Keep `PRECAUTIONARY_STOPS_ENABLED=false` in production until staging has the full telemetry path.

## Stages

1. Week 1: enable on staging. Verify `extra_stop_suggested`, `extra_stop_accepted`, `extra_stop_dismissed`, `extra_stop_undone`, and `precautionary_stop_distribution` in PostHog.
2. Week 2: enable for 10% of production traffic. Monitor dismissal rate, support feedback, route-planning errors, and Vercel function health.
3. Week 3: move to full production rollout only if dismissal rate stays below 50% and no support escalation appears.
4. Weeks 4-7: telemetry calibration window. Review reason distribution, pressure-score buckets, sparse-area counts, and accepted-versus-dismissed ratios before tuning ADR-0009 thresholds.

## Guardrail

If `extra_stop_dismissed / extra_stop_suggested >= 0.50` for a rolling 7-day window, pause rollout and revisit the copy, thresholds, or v2 user-facing mode toggle.
