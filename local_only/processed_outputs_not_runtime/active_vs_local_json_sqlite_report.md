# Active vs Local Compare

- Active source URL used: `https://hunt-builder.uoga.org/data/hunt-master-canonical.json?v=20260404-selection-matrix-fix-1`
- Active JSON SHA256: `324dfd3f19923ef3183988024106d2d1886288fac7ea2e281d5812703b8d6c50`
- Local JSON SHA256:  `324dfd3f19923ef3183988024106d2d1886288fac7ea2e281d5812703b8d6c50`

## Active vs Local JSON
- Active rows: 1288
- Local JSON rows: 1288
- Common hunt_code: 1288
- Only in active: 0
- Only in local JSON: 0
- Shared columns checked: 42
- Differing cells: 0

## Active vs Local SQLite (hunt_master_canonical_2026)
- Active rows: 1288
- SQLite rows: 1289
- Common hunt_code: 1288
- Only in active: 0
- Only in sqlite: 1
- Shared columns checked: 30
- Differing cells: 8639
- Sample only-in-sqlite: DB1276
- Top differing columns:
  - youth_flag: 1288
  - has_antlerless_draw: 1088
  - has_bonus_draw: 1088
  - has_harvest: 1088
  - permit_overlay_source: 896
  - permits_2026_total: 608
  - permits_2026_res: 547
  - data_status: 510
  - permit_status: 510
  - permits_2026_nr: 407
  - source_authority: 175
  - permits_2025_nr: 95
  - permits_2025_res: 95
  - permits_2025_total: 95
  - weapon: 67
