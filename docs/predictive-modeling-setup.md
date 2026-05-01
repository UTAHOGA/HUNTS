# Predictive Modeling Setup (Local + GitHub)

## What I reviewed
- Source reviewed: `D:/DOCUMENTS/GitHub/deep-research-report.md`
- Verdict: It is broadly aligned with your PDF strategy (constraints layer + predictive layer + validation), but it has text-encoding artifacts and one Git step that should be corrected.

## Critical correction from the report
- The report says to run `git remote add origin https://github.com/UTAHOGA/HUNTS.git` in a new local data folder.
- In this repo, `origin` is already set and correct. Re-adding it would fail or cause confusion.

## Recommended structure (inside this repo)
Use this structure in `D:/DOCUMENTS/GitHub/HUNTS`:

- `data/` raw or source-aligned website datasets
- `processed_data/` derived tables used by UI/model
- `scripts/` repeatable ETL/model prep scripts
- `modeling/` notebooks/specs/validation outputs
- `docs/` decisions, assumptions, model cards, runbooks

## Local workflow
1. Add new external inputs to `data/` (or a dated subfolder).
2. Run normalization scripts from `scripts/`.
3. Write model-ready outputs to `processed_data/`.
4. Store model assumptions and validation results in `modeling/` and `docs/`.
5. Commit small, auditable changes with clear messages.

## GitHub workflow
1. Check status: `git status --short`
2. Stage by scope: `git add docs/ modeling/ scripts/` (and specific data files as needed)
3. Commit: `git commit -m "Add predictive modeling scaffolding and setup docs"`
4. Push: `git push origin main` (or a feature branch)

## Branch recommendation
For modeling work, use feature branches (example):
- `UTAHOGA/modeling-scaffold`
- `UTAHOGA/etl-normalization-pass1`

## Next practical step
- Build `scripts/normalize_hunt_inputs.py`
- Build `scripts/build_model_features.py`
- Write `docs/model-validation-plan.md` (time split + spatial holdout + calibration checks)
