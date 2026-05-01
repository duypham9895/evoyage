# Locale keys to integrate — Phase 4.1 (sample-trip chips)

Owner of locale files: orchestrator agent.
Source component: `src/components/trip/SampleTripChips.tsx` (currently hardcoded; remove the local `LABEL_COPY` and the `startVi/startEn/endVi/endEn` fields once these keys land, replacing them with `t(...)` calls).

## Required keys

### `src/locales/en.json`
```json
{
  "sample_trip_chips_label": "Try a sample trip",
  "sample_trip_hcm_dalat_start": "District 1, HCMC",
  "sample_trip_hcm_dalat_end": "Da Lat",
  "sample_trip_hcm_vungtau_start": "District 1, HCMC",
  "sample_trip_hcm_vungtau_end": "Vung Tau",
  "sample_trip_hanoi_halong_start": "Hanoi",
  "sample_trip_hanoi_halong_end": "Ha Long",
  "sample_trip_danang_hue_start": "Da Nang",
  "sample_trip_danang_hue_end": "Hue"
}
```

### `src/locales/vi.json`
```json
{
  "sample_trip_chips_label": "Gợi ý cho bạn",
  "sample_trip_hcm_dalat_start": "Quận 1, TP.HCM",
  "sample_trip_hcm_dalat_end": "Đà Lạt",
  "sample_trip_hcm_vungtau_start": "Quận 1, TP.HCM",
  "sample_trip_hcm_vungtau_end": "Vũng Tàu",
  "sample_trip_hanoi_halong_start": "Hà Nội",
  "sample_trip_hanoi_halong_end": "Hạ Long",
  "sample_trip_danang_hue_start": "Đà Nẵng",
  "sample_trip_danang_hue_end": "Huế"
}
```

## After integration

1. Replace the hardcoded `SAMPLE_TRIPS` and `LABEL_COPY` constants in `src/components/trip/SampleTripChips.tsx` with `t('sample_trip_*')` calls.
2. Update `SampleTripChips.test.tsx` mock to translate the new keys.
3. Delete this file.
