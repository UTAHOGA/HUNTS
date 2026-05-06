"""Validation helpers for Utah engine V1 outputs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

from .schema import normalize_hunt_code


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    issues: list[str]


def validate_hunt_code_preservation(
    rows: Iterable[Mapping[str, object]],
    allowed_hunt_codes: set[str],
) -> ValidationResult:
    issues: list[str] = []
    for row in rows:
        code = normalize_hunt_code(row.get("hunt_code"))
        if not code:
            issues.append("missing_hunt_code")
            continue
        if allowed_hunt_codes and code not in allowed_hunt_codes:
            issues.append(f"invented_hunt_code:{code}")
    return ValidationResult(ok=not issues, issues=issues)


def validate_required_output_files(output_dir: Path) -> ValidationResult:
    required = (
        "draw_prediction_engine_v1.csv",
        "hunt_decision_scores_v1.csv",
        "point_creep_forecast_v1.csv",
        "model_run_report_v1.json",
    )
    issues: list[str] = []
    for name in required:
        if not (output_dir / name).exists():
            issues.append(f"missing_output:{name}")
    return ValidationResult(ok=not issues, issues=issues)
