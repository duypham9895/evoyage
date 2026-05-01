# eVi Nudge — Locale Keys (Pending Integration)

The `<EViNudge />` component (`src/components/trip/EViNudge.tsx`) currently
hardcodes its copy in a local `COPY` dictionary. The orchestrator should
move these strings into `src/locales/en.json` and `src/locales/vi.json`,
then refactor the component to call `t('evi_nudge_*')`.

## Keys to add

### `src/locales/en.json`
```json
{
  "evi_nudge_headline": "Stuck? Ask eVi.",
  "evi_nudge_body": "Try: 'suggest a weekend trip'",
  "evi_nudge_cta": "Open eVi",
  "evi_nudge_dismiss": "Later",
  "evi_nudge_close_aria": "Close"
}
```

### `src/locales/vi.json`
```json
{
  "evi_nudge_headline": "Bí ý tưởng? Hỏi eVi nhé.",
  "evi_nudge_body": "Ví dụ: 'gợi ý chuyến đi cuối tuần'",
  "evi_nudge_cta": "Mở eVi",
  "evi_nudge_dismiss": "Để sau",
  "evi_nudge_close_aria": "Đóng"
}
```

## Refactor steps for the orchestrator

1. Add the keys above to both locale files (the order should match — the
   `locale-keys.test.ts` test enforces parity).
2. In `src/components/trip/EViNudge.tsx`:
   - Remove the local `COPY` dictionary.
   - Replace `copy.headline` → `t('evi_nudge_headline')`, etc.
   - Replace `copy.closeAria` → `t('evi_nudge_close_aria')`.
3. Update `EViNudge.test.tsx` to use the orchestrator's standard `translations`
   mock pattern (see `StationStatusReporter.test.tsx` for an example) — the
   tests already assert exact Vietnamese/English strings, so they should pass
   unchanged once the mock returns those strings.
4. Delete this file once integrated.
