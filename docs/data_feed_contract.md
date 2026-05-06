# Data Feed Contract

This project uses a public-data MVP contract now, with an upgrade path to true application-level feeds later.

## Required raw tables

- `applications_raw.csv`
- `applicants_raw.csv`
- `groups_raw.csv`
- `points_raw.csv`
- `quotas_raw.csv`
- `draw_results_raw.csv`
- `hunt_metadata_raw.csv`
- `harvest_quality_raw.csv`

## Privacy

- Do not store names, addresses, phone numbers, email addresses, birthdates, SSNs, or raw customer IDs.
- Use hashed IDs only.

## Source levels

- `fixture`: synthetic test data only.
- `public_historical_proxy`: public DWR reports and metadata.
- `application_level_feed`: true predictive feed with choice, group, residency, youth, and eligibility fields.

## Compatibility rule

The existing UI still consumes processed CSVs keyed by `(hunt_code, residency, points)`. New modeled fields must be additive.

## Fixture rebuild pipeline

- The canonical rebuild entrypoint is `engine.utah.materialize`.
- Exact command shape:

  ```bash
  python -m engine.utah.materialize --input-dir data/utah/fixtures --output-dir processed_data --draw-year 2026 --iterations 10000 --seed 2026 --model-version hybrid_ml_v1.0.0 --rule-version utah_draw_model_v1.0.0 --quota-source fixture --applicant-pool-source fixture
  ```

- It reads the synthetic tables in `data/utah/fixtures/`.
- It writes the compatibility CSVs directly into the chosen output directory as:
  - `draw_reality_engine.csv`
  - `point_ladder_view.csv`
  - `hunt_master_enriched.csv`
  - `hunt_unit_reference_linked.csv`
- Rebuild outputs should be labeled by source level. For the fixture pipeline, use `fixture` or `fixture_rebuild` rather than implying a true predictive feed.
