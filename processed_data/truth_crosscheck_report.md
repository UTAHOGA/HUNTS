# Truth Source Cross-Check Report

- Canonical JSON: `data\hunt-master-canonical.json`
- Full GeoJSON: `data\hunt_boundaries.geojson`
- Lite GeoJSON: `data\hunt-boundaries-lite.geojson`
- Reference DB (truth downloads): `processed_data\truth_downloads_comprehensive.sqlite`

## Canonical
- Records: 1288
- Unique hunt codes: 1288
- Unique boundary IDs: 347

## Full GeoJSON coverage
- Features: 177
- Primary IDs: 54
- Member IDs: 318
- Union IDs: 361
- Canonical boundary coverage: 347 / 347 (100.0%)

## Lite GeoJSON coverage
- Features: 177
- Primary IDs: 54
- Member IDs: 318
- Union IDs: 361
- Canonical boundary coverage: 347 / 347 (100.0%)

## Full vs Lite union diff
- Only in full count: 0
- Only in lite count: 0

## Truth downloads DB scan
- Tables scanned: 444
- Matched boundary/hunt columns: 4
- Boundary IDs found: 32
- Hunt codes found: 0
- Canonical boundary coverage from downloads DB: 19 / 347 (5.48%)
- Canonical hunt code coverage from downloads DB: 0 / 1288 (0.0%)

## Interpretation
- Use canonical JSON + full GeoJSON as publish truth.
- Use lite GeoJSON as fast runtime first load when its union coverage matches full.
- Use downloads DB scan as an independent cross-check signal, not direct runtime source.
