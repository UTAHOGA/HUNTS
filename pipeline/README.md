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

