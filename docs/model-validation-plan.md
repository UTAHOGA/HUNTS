# Model Validation Plan

## Purpose
Prevent overconfident or misleading hunt predictions by validating with spatial and temporal rigor.

## Split Strategy
1. Time split
- Train on older seasons.
- Test on newer seasons.

2. Spatial holdout
- Hold out full geographic blocks or hunt-unit groups.
- Do not use random row split as primary evidence.

3. Spatiotemporal holdout
- Hold out a region and future season window together.

## Metrics
- Classification: ROC-AUC, PR-AUC, F1, precision, recall.
- Calibration: Brier score and reliability plot bins.
- Operational: top-k hit rate by unit or region.

## Release Gates
- No release if temporal or spatial holdout collapses versus random CV.
- No release if calibration drift exceeds threshold.
- No release if legal/access masking fails any audit row.

## Data Integrity Checks Before Training
- Required fields present (`hunt_code`, `species`, `hunt_type`, `weapon`).
- Duplicates checked on `hunt_code`.
- Null-rate report exported with every run.
- Source manifest retained for provenance.

## Reporting
Every training run should output:
- split definitions
- metrics table
- calibration summary
- known failure regions/species
- data snapshot identifiers

