# Engineering Retros

Weekly engineering retrospectives for eVoyage. Run `/retro` to generate a new one.

## Structure

```
docs/retros/
├── README.md              ← This file
├── YYYY-MM-DD.json        ← Machine-readable snapshot (metrics, trends)
└── YYYY-MM-DD.md          ← Human-readable narrative (wins, improvements, habits)
```

## Naming Convention

- **Date = Friday of the retro week** (or the day `/retro` was run)
- One retro per week — if re-run, overwrite the same date
- JSON holds raw metrics for week-over-week comparison
- Markdown holds the narrative, wins, and action items

## Tracked Metrics

| Metric | Week 1 Baseline |
|--------|----------------|
| Commits | 162 |
| Net LOC | 51,444 |
| Test ratio | 11% |
| Feat:Fix ratio | 1:1 |
| Active days | 5/7 |
| Deep sessions | 5 |
| Shipping streak | 5 days |

## How to Use

```bash
# In Claude Code
/retro              # Default: last 7 days
/retro compare      # Compare this week vs last week
/retro 14d          # Last 14 days
```

The `/retro` skill automatically loads the most recent JSON snapshot for trend comparison.
