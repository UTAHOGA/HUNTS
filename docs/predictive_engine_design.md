# Predictive Engine Design

This repository is moving from a legacy research-page lookup system to a Utah predictive draw engine.

## Scope

- Preserve the current research UI and row key `(hunt_code, residency, points)`.
- Replace the legacy `MAX POOL = 100%` behavior with modeled probability logic.
- Keep draw mechanics deterministic underneath the UI.
- Add a public-data MVP first, then grow toward true feed support.

## Layering

1. Deterministic Utah draw rules live in `engine/utah/simulator.py` and `engine/utah/rules.py`.
2. Baseline demand estimation lives in `engine/utah/demand.py`.
3. Quota forecasting lives in `engine/utah/quota_forecast.py`.
4. Materialization into legacy-compatible CSVs lives in `engine/utah/materialize.py`.
5. Backtesting and calibration live in `engine/utah/backtest.py` and `engine/utah/calibration.py`.
6. The canonical fixture rebuild CLI is `python -m engine.utah.materialize ...` and it writes the four processed CSVs directly into the chosen output directory.

## Probability units

- `p_*` fields are decimal probabilities in `[0, 1]`.
- `*_pct` fields are percentages in `[0, 100]`.
- The UI should prefer `display_odds_pct`, then `p_draw_mean`, then legacy odds fields.
- `status = MAX POOL` is descriptive only and does not imply a guarantee.

## Current limitations

- Public data does not fully expose group membership, choice rank behavior, or current applicant pools.
- Fixture data is allowed for tests and local development.
- A true-feed engine requires administrative feed support.
