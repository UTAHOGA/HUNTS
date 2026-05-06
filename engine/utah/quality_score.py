"""Transparent hunt quality scoring for Utah engine V1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional

from .schema import to_float, to_int


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


@dataclass(frozen=True)
class QualityScore:
    hunt_quality_score: float
    success_rate_score: float
    harvest_score: float
    hunters_afield_score: float
    days_score: float
    trend_score: float
    permit_stability_score: float


def compute_hunt_quality_score(
    harvest_row: Mapping[str, object] | None,
    trend: str,
    permit_stability_score: float,
) -> QualityScore:
    row = harvest_row or {}

    success_rate_pct = to_float(row.get("success_percent") or row.get("percentSuccess") or row.get("harvest_success_percent_2025"))
    if success_rate_pct is None:
        success_rate_pct = to_float(row.get("avgSatisfaction"))
    if success_rate_pct is None:
        success_rate_score = 50.0
    else:
        if success_rate_pct <= 1.0:
            success_rate_pct *= 100.0
        success_rate_score = max(0.0, min(100.0, success_rate_pct))

    harvest = to_float(row.get("harvest") or row.get("success_harvest") or row.get("harvest_2025"))
    permits = to_float(row.get("permits") or row.get("public_permits_2025"))
    harvest_ratio = (harvest / permits) if (harvest is not None and permits is not None and permits > 0) else None
    harvest_score = 50.0 if harvest_ratio is None else _clamp01(harvest_ratio) * 100.0

    hunters = to_float(row.get("hunters") or row.get("success_hunters") or row.get("hunters_afield"))
    hunters_afield_score = 50.0 if hunters is None else min(100.0, max(0.0, hunters))

    mean_days = to_float(row.get("avgDays") or row.get("mean_days_hunted") or row.get("harvest_average_days_2025"))
    if mean_days is None:
        days_score = 50.0
    else:
        # Lower days hunted is better in this simple conservative score.
        days_score = max(0.0, min(100.0, 100.0 - (mean_days * 8.0)))

    trend_upper = str(trend or "").strip().upper()
    trend_score = 50.0
    if trend_upper == "GREEN":
        trend_score = 75.0
    elif trend_upper == "RED":
        trend_score = 25.0

    permit_stability_score = max(0.0, min(100.0, permit_stability_score))

    hunt_quality_score = (
        (0.30 * success_rate_score)
        + (0.20 * harvest_score)
        + (0.15 * hunters_afield_score)
        + (0.10 * days_score)
        + (0.15 * trend_score)
        + (0.10 * permit_stability_score)
    )

    return QualityScore(
        hunt_quality_score=round(hunt_quality_score, 3),
        success_rate_score=round(success_rate_score, 3),
        harvest_score=round(harvest_score, 3),
        hunters_afield_score=round(hunters_afield_score, 3),
        days_score=round(days_score, 3),
        trend_score=round(trend_score, 3),
        permit_stability_score=round(permit_stability_score, 3),
    )


def compute_permit_stability_score(current_permits: Optional[int], prior_permits: Optional[int]) -> float:
    if current_permits is None or prior_permits is None:
        return 50.0
    if prior_permits <= 0 and current_permits <= 0:
        return 100.0
    if prior_permits <= 0:
        return 40.0
    delta_ratio = abs(current_permits - prior_permits) / max(prior_permits, 1)
    return round(max(0.0, min(100.0, 100.0 - (delta_ratio * 100.0))), 3)
