# Harvest And Report Year Rules (Utah Hunt Model)

## Core rule
For `draw_odds` and `harvest_report` files:
- `reported_hunt_year` = the year the hunt/harvest actually occurred (from file title/content)
- `model_target_year` = `reported_hunt_year + 1`

This matches predictive use: prior completed season informs the following draw year.

## Your examples
- `2023-harvest-data` -> reported year `2023` -> model target year `2024`
- `22_bg_report` -> reported year `2022` -> model target year `2023`
- `2023_le_oial_all` -> reported year `2023` -> model target year `2024`

## Important distinction
- Folder year (`publish_year`) is storage/provenance context.
- Reported hunt year drives modeling alignment.
- They can differ without being wrong.
- Naming note: many legacy files/folders say `draw_odds`, but semantically these are `draw_results` inputs for the next prediction year.

## Recommended practice
1. Keep raw files for provenance (do not blindly bulk-move).
2. Always compute and store:
   - `publish_year`
   - `reported_hunt_year_inferred`
   - `model_target_year`
3. Flag only true anomalies for manual review:
   - reported year cannot be inferred
   - reported year appears in the future relative to storage year

## Current implementation in repo
Script:
- `pipeline/scripts/ingest/rebuild_model_year_manifest.py`

Manifest output:
- `pipeline/manifests/pdf_model_ready_manifest_with_target_year_v3.csv`

Manual review list:
- `processed_data/pdf_year_manual_review.csv`
