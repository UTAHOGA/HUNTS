# Pipeline Data Layout

This folder is the analytics/modeling pipeline workspace, separated from website runtime assets.

## Top-level
- `raw/` incoming source files, partitioned by `year/format`
- `normalized/` cleaned source-aligned tables
- `processed/` curated outputs for analytics/modeling
- `manifests/` run and file inventories
- `quality/` data quality reports
- `lineage/` source-to-output lineage records
- `scripts/` pipeline-stage scripts

## Processed subfolders
- `processed/canonical/` canonical merged hunt tables
- `processed/features/` model-ready feature sets
- `processed/analytics/` KPI and exploration outputs
- `processed/exports/` deliverables for downstream tools

## Script subfolders
- `scripts/ingest/`
- `scripts/normalize/`
- `scripts/merge/`
- `scripts/validate/`
- `scripts/modeling/`

## Raw partitioning rule (initial load)
Files were copied from:
- `data/`
- top-level `*.csv`, `*.xlsx`, `*.json`, `*.geojson`, `*.kmz`, `*.txt`

Year bucket:
- `2024`, `2025`, `2026`, otherwise `unknown`

Format bucket:
- `csv`, `json`, `xlsx`, `geojson`, `kmz`, `txt`, `other`

Inventory manifest:
- `manifests/raw_file_inventory.csv`

Notes:
- This load is non-destructive (copy only). Existing site files remain where they were.
- Future runs should append/update manifests and add run timestamps.

## Truth Build + Cross-Check (2026)

Use this workflow to keep web runtime data fast and trustworthy:

1. Rebuild synchronized SQLite from canonical JSON + full boundary GeoJSON.
2. Cross-check canonical IDs against full/lite GeoJSON (including composite `member_boundary_ids`).
3. Optionally scan downloaded geodatabase exports as an independent reference signal.

Scripts:
- `pipeline/scripts/build_truth_sqlite_from_json.py`
- `pipeline/scripts/crosscheck_truth_sources.py`
- `pipeline/scripts/build_and_compare_hunt_geodatabases.py`
- `pipeline/scripts/build_utah_draw_ml_feed_v1.py`

Example commands (Windows PowerShell):

```powershell
& "C:\Users\tyler\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  pipeline\scripts\build_truth_sqlite_from_json.py

& "C:\Users\tyler\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  pipeline\scripts\crosscheck_truth_sources.py

& "C:\Users\tyler\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  pipeline\scripts\build_and_compare_hunt_geodatabases.py `
  --source-dir "pipeline\RAW\hunt_unit_mapping\sql lite" `
  --output-db "processed_data\truth_downloads_comprehensive.sqlite" `
  --active-db "hunt_master_canonical_2026_built.sqlite" `
  --report "processed_data\truth_downloads_vs_active_db_report.md"

& "C:\Users\tyler\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  pipeline\scripts\build_utah_draw_ml_feed_v1.py `
  --engine-csv processed_data\draw_reality_engine.csv `
  --output-csv processed_data\ml_draw_predictions_v1.csv `
  --report-json processed_data\ml_draw_predictions_v1_report.json `
  --model-version utah_draw_hybrid_v1_rules `
  --source-tag utah_dwr_2026_seed
```

Expected outputs:
- `processed_data/hunt_truth_from_json.sqlite`
- `processed_data/truth_crosscheck_report.md`
- `processed_data/truth_crosscheck_report.json`
- `processed_data/truth_downloads_comprehensive.sqlite`
- `processed_data/truth_downloads_vs_active_db_report.md`
