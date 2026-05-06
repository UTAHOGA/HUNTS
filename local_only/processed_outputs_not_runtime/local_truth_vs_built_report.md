# Local Truth vs Built DB Comparison

- Truth JSON: `data\hunt-master-canonical.json`
- Truth boundary file: `data\hunt_boundaries.geojson`
- New truth DB: `processed_data\hunt_truth_local_build.sqlite`
- Compared against: `hunt_master_canonical_2026_built.sqlite` table `hunt_master_canonical_2026`

## Row Counts
- truth_hunt_master rows: 1288
- built table rows: 1289
- truth_boundaries rows: 177

## Key Coverage (hunt_code)
- Only in truth: 0
- Only in built: 1
- In both: 1288
- Sample only-in-built: DB1276

## Field Differences (shared columns)
- Shared columns checked: 30
- Total differing cells: 8639
- youth_flag: 1288
- has_harvest: 1088
- has_bonus_draw: 1088
- has_antlerless_draw: 1088
- permit_overlay_source: 896
- permits_2026_total: 608
- permits_2026_res: 547
- permit_status: 510
- data_status: 510
- permits_2026_nr: 407
- source_authority: 175
- permits_2025_res: 95
- permits_2025_nr: 95
- permits_2025_total: 95
- weapon: 67
- sex_type: 41
- hunt_type: 37
- hunt_name: 2
- season: 2
