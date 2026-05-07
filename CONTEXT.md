# eVoyage

EV trip planning for Vietnam. Helps drivers plan long-distance routes with charging stops, accounting for real-world range, station availability, and local road conditions (passes, holidays, peak hours).

## Language

### Trip planning

**Trip Plan**:
The output of `TripPlanner` for a given `(origin, destination, vehicle, battery%)` input — a sequence of Stops with their Alternatives and range info. Owned by `TripPlanner` Module (ADR-0004).
_Avoid_: trip, route, journey, itinerary.

**Stop** (or **Charging Stop**):
A planned charging event on a Trip Plan. Represents *time* + *intent*: "I will recharge here before continuing." Distinct from the physical location.
_Avoid_: station break, recharge point.

**Station**:
A physical location with one or more chargers, owned by an Operator. Independent of any Trip — exists in the database whether anyone visits or not.
_Avoid_: charger (a charger is one connector at a Station), point, location.

**Alternative Station** (or **Alternative**):
A Station attached to a Stop as a pre-computed fallback. Each Stop carries 0–3 Alternatives (ADR-0006), with the count driven by `BackupPressureScore`. Ranking is delegated to the existing `scoreStation` (detour drive-time + charge-time + VinFast affinity). Different from "a Station you could detour to" — an Alternative is explicitly endorsed by `TripPlanner`.
_Avoid_: backup, fallback (in code). Vietnamese user-facing copy uses "trạm dự phòng".

**Operator**:
The brand running a Station — primarily VinFast, V-GREEN, EVN. Affects connector type, payment method, and app required. Same-Operator continuity (e.g. a VinFast vehicle charging at a VinFast Station) earns a ranking-score bonus in `scoreStation`, reflecting same-app payment + membership and VinFast's ~80% DC fast-charger market share in VN.

### Range

**Official Range**:
Manufacturer-claimed range (e.g. VinFast VF8 = 471km). Lives on `Vehicle.officialRangeKm`. Almost never achieved in real-world use.

**Range Safety Factor** (or **Safety Factor**):
Multiplier (0.50–1.00) applied to Official Range to estimate real-world maximum range. Default 0.80. User-adjustable per trip. Tier 0.70 = "very safe", 0.80 = "recommended", 0.90+ = "risky" (see `getRangeSafetyWarning`).

**Usable Range**:
The range a driver can actually plan to use, given current battery, target arrival battery, and Safety Factor:
```
usableRangeKm = officialRangeKm × safetyFactor × (currentBattery% − minArrivalBattery%) / 100
```
_Avoid_: real range, available range.

### Backup planning

**Backup Pressure Score** (or **Pressure Score**):
A 0–5 composite risk score per Stop, determining how many Alternatives to attach. Sums five signals: tight margin to next Stop, low arrival battery, sparse downstream Stations, Peak Window arrival, holiday date. Defined in ADR-0006.

**Downstream Density**:
Count of Stations within 100km along the remaining route after a given Stop. Low Downstream Density ⇒ high Pressure (if this Stop fails and the next is far, the driver is stranded).

**Peak Window**:
Hardcoded local-time ranges 11h–13h and 17h–20h. A Stop whose charging session overlaps a Peak Window earns +1 Pressure. Heuristic — to be replaced by data-driven `congestion_forecast` in Phase 3b.

## Relationships

- A **Trip Plan** has one or more **Stop**s. Each **Stop** has 0–3 **Alternative**s.
- A **Stop** references a **Station** as primary; its **Alternative**s reference different nearby **Station**s.
- A **Station** is owned by exactly one **Operator**.
- **Usable Range** depends on **Official Range** × **Safety Factor** × battery delta.
- **Backup Pressure Score** is computed *per* **Stop**, using context from the surrounding **Trip Plan** (next-Stop distance, downstream **Station** count, trip departure time).

## Example dialogue

> **Dev:** "When the **Trip Plan** comes back, are the **Alternative**s for Stop 2 the same set as for Stop 3 if both are near each other?"
>
> **Domain expert:** "No — each **Stop**'s **Alternative**s are independent. Even if Stop 2 and Stop 3 are 10km apart and share candidate **Station**s, the ranking is per-Stop because detour cost is measured from each one separately."

> **Dev:** "If a user picks **Safety Factor** 0.95, can they still get **Alternative**s?"
>
> **Domain expert:** "Yes — Safety Factor affects **Usable Range**, which feeds the 'tight margin' **Pressure** signal. A risky Safety Factor will tend to *increase* Pressure (more Alternatives) because more Stops will fail the 70%-of-range threshold. We don't gate Alternatives on Safety Factor itself."

## Flagged ambiguities

- "**Backup**" was used to mean three different things during initial design: pre-trip alternatives, in-trip reroute targets, and precautionary extra Stops. **Resolved**: only pre-trip alternatives are called **Alternative**s; in-trip rerouting and precautionary extra Stops are out of scope for v1 (ADR-0006).
- **Stop** vs **Station** — used interchangeably in early conversations. **Resolved**: Stop = planned event on a Trip; Station = physical location. A Stop *uses* a Station.
- "**Backup**" in code: avoid. Use **Alternative** in code; **trạm dự phòng** in user-facing Vietnamese copy.
